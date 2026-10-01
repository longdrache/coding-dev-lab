import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Optional,
  Inject,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { DatabaseService } from '../database/database.service.ts';
import { CreateProblemDto } from './dto/create-problem.dto.ts';
import { PresenceService } from '../presence/presence.service.ts';
import { ProblemsService } from '../problems/problems.service.ts';
import { readIsVipFlag } from '../problems/vip-problem.policy.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly db: DatabaseService,
    @Optional()
    @Inject(PresenceService)
    private readonly presence?: PresenceService,
    // `@Optional` vì lý do đã ghi ở `problems.module.ts`: đây là phụ thuộc chỉ để
    // xoá cache. Nếu `ProblemsModule` không được import (test cũ dựng service
    // tay) thì service vẫn chạy, chỉ mất bước xoá cache — mọi assert về khoá
    // vẫn đúng vì policy không phụ thuộc cache.
    @Optional()
    private readonly problems?: ProblemsService,
  ) {}

  // PEM trong env có thể ở 3 dạng: newline thật (dotenv đã expand),
  // "\n" literal, hoặc "\\n" double-escape — chuẩn hóa tất cả
  private normPem(raw: string): string {
    return raw
      .replace(/^"|"$/g, '')
      .replace(/\\+n/g, '\n')
      .replace(/\\\r?\n/g, '\n')
      .trim();
  }

  private getPrivateKey(): string {
    const raw =
      process.env.ADMIN_JWT_PRIVATE_KEY ?? process.env.ADMIN_PRIVATE_KEY;
    if (!raw) throw new UnauthorizedException('Missing ADMIN_JWT_PRIVATE_KEY');
    return this.normPem(raw);
  }

  private getPublicKey(): string | null {
    const raw =
      process.env.ADMIN_JWT_PUBLIC_KEY ?? process.env.ADMIN_PUBLIC_KEY;
    if (!raw) return null;
    return this.normPem(raw);
  }

  async login(email: string, password: string): Promise<string> {
    const expEmail = process.env.ADMIN_EMAIL;
    const hash = process.env.ADMIN_PASSWORD_HASH;
    const plain = process.env.ADMIN_PASSWORD;
    if (!expEmail) throw new UnauthorizedException('Missing admin env');
    if (email !== expEmail) throw new UnauthorizedException('Sai tài khoản');
    let ok = false;
    if (hash) ok = await bcrypt.compare(password, hash);
    // So sánh plaintext chỉ cho dev local — production bắt buộc hash
    else if (plain && process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
      ok = password === plain;
    } else throw new UnauthorizedException('Missing password env');
    if (!ok) throw new UnauthorizedException('Sai mật khẩu');
    // Ký RS256 bằng private key — FE chỉ giữ public key để verify
    return jwt.sign({ sub: 'admin', role: 'admin' }, this.getPrivateKey(), {
      algorithm: 'RS256',
      expiresIn: '30m',
    });
  }

  verifyJwt(token: string): any {
    const publicKey = this.getPublicKey();
    if (publicKey) {
      try {
        return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as any;
      } catch {
        // Rơi xuống fallback HS256 bên dưới để tương thích cookie cũ
      }
    }
    // Fallback HS256 cũ chỉ cho dev — production bắt buộc RS256
    // (tránh alg-confusion khi quên cấu hình key)
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
      throw new UnauthorizedException('Admin token không hợp lệ');
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new UnauthorizedException('Missing JWT key');
    return jwt.verify(token, secret) as any;
  }

  // stubs kept for backward compat with scaffold (unused but referenced in plan)
  async verifyLogin(_e: string, _p: string) {
    return false;
  }

  signJwt() {
    return '';
  }

  // ---- Stats / QNA ----

  async getStats() {
    const [problems, qna, submissions] = await Promise.all([
      this.db.problem.count(),
      this.db.qnaQuestion.count(),
      this.db.submission.count(),
    ]);

    // online via PresenceService (in-memory, không query DB).
    // KHÔNG fetch HTTP chính nó (/api/presence/online) vì khi pool cạn
    // sẽ deadlock: request chờ connection mà connection đang bận giữ request.
    let online: number | null = null;
    if (this.presence) {
      try {
        online = this.presence.count();
      } catch {
        online = null;
      }
    }

    // Tất cả bucket theo ngày Việt Nam (UTC+7) để khớp ActivityDay
    // (lưu theo ngày VN) và múi giờ trình duyệt của user
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    const vnDayKey = (d: Date) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
    const todayVnKey = vnDayKey(new Date());
    const startVnKey = (() => {
      const d = new Date(todayVnKey + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 29);
      return d.toISOString().slice(0, 10);
    })();
    // ActivityDay lưu ngày VN dưới dạng UTC-midnight nên so sánh trực tiếp key;
    // Submission.createdAt là mốc thật nên trừ 7h để lấy đủ ngày VN đầu tiên
    const activityGte = new Date(startVnKey + 'T00:00:00Z');
    const submissionGte = new Date(activityGte.getTime() - VN_OFFSET_MS);

    // activity last 30d (VN days)
    let activity30d: any[] = [];
    try {
      activity30d = await this.db.activityDay.findMany({
        where: { date: { gte: activityGte } },
        orderBy: { date: 'asc' },
      });
    } catch {
      activity30d = [];
    }

    // topProblems via groupBy submission problemSlug
    let topProblems: any[] = [];
    try {
      topProblems = await (this.db.submission.groupBy as any)({
        by: ['problemSlug'],
        _count: { problemSlug: true },
        orderBy: { _count: { problemSlug: 'desc' } },
        take: 5,
      });
    } catch {
      topProblems = [];
    }

    // Aggregate runs/submits per VN day for the 30-day chart.
    // date phát ra ở dạng UTC-midnight nên browser VN (+7) render đúng ngày.
    const runsByDay = new Map<string, number>();
    for (const r of activity30d) {
      const k = vnDayKey(new Date(r.date));
      runsByDay.set(k, (runsByDay.get(k) ?? 0) + (r.count ?? 0));
    }
    let subsByDay = new Map<string, number>();
    try {
      const subs = await this.db.submission.findMany({
        where: { createdAt: { gte: submissionGte } },
        select: { createdAt: true },
      });
      for (const s of subs) {
        const k = vnDayKey(new Date(s.createdAt));
        subsByDay.set(k, (subsByDay.get(k) ?? 0) + 1);
      }
    } catch {
      subsByDay = new Map();
    }
    const daily: Array<{ date: string; runs: number; submits: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(todayVnKey + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      const k = d.toISOString().slice(0, 10);
      daily.push({ date: k + 'T00:00:00.000Z', runs: runsByDay.get(k) ?? 0, submits: subsByDay.get(k) ?? 0 });
    }

    const runs30d = daily.reduce((s, d) => s + d.runs, 0);
    const submits30d = daily.reduce((s, d) => s + d.submits, 0);

    // Tổng runs/submits từ đầu tháng VN (cửa sổ 30 ngày có thể thiếu
    // 1-2 ngày đầu tháng nên query riêng cho chuẩn)
    const monthPrefix = todayVnKey.slice(0, 7);
    const monthStartUtc = new Date(monthPrefix + '-01T00:00:00Z');
    let monthRuns = 0;
    let monthSubmits = 0;
    try {
      const [monthActs, monthSubs] = await Promise.all([
        this.db.activityDay.findMany({
          where: { date: { gte: monthStartUtc } },
          select: { date: true, count: true },
        }),
        this.db.submission.findMany({
          where: { createdAt: { gte: new Date(monthStartUtc.getTime() - VN_OFFSET_MS) } },
          select: { createdAt: true },
        }),
      ]);
      for (const r of monthActs) {
        if (vnDayKey(new Date(r.date)).startsWith(monthPrefix)) monthRuns += r.count ?? 0;
      }
      for (const s of monthSubs) {
        if (vnDayKey(new Date(s.createdAt)).startsWith(monthPrefix)) monthSubmits += 1;
      }
    } catch {
      monthRuns = 0;
      monthSubmits = 0;
    }

    return {
      online,
      counts: { problems, qna, submissions },
      activity30d,
      topProblems,
      daily,
      runs30d,
      submits30d,
      todayRuns: daily[daily.length - 1]?.runs ?? 0,
      todaySubmits: daily[daily.length - 1]?.submits ?? 0,
      monthRuns,
      monthSubmits,
    };
  }

  async listQna() {
    return this.db.qnaQuestion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getLoginAnalytics() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [recent, byCountry] = await Promise.all([
      this.db.loginEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { userId: true, country: true, createdAt: true },
      }),
      this.db.$queryRaw<Array<{ country: string; count: number }>>`
        SELECT COALESCE(NULLIF("country", ''), 'XX') AS country,
               COUNT(*)::int AS count
        FROM "LoginEvent"
        WHERE "createdAt" >= ${since}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 12
      `,
    ]);
    // Tên lấy thẳng từ bảng `User` (1 gọi batch theo id). Không có user
    // (khách vãng lai) hoặc user đã xoá thì hiện "Khách" — không vỡ dashboard.
    const ids = [
      ...new Set(
        recent.map((r) => r.userId).filter((v): v is number => v !== null),
      ),
    ];
    const profiles = new Map<number, { name: string }>();
    if (ids.length > 0) {
      const users = await this.db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true },
      });
      for (const u of users) profiles.set(u.id, { name: u.name ?? u.email });
    }
    return {
      recent: recent.map((r, i) => ({
        key: `${r.userId ?? 'guest'}-${i}`,
        name: (r.userId !== null ? profiles.get(r.userId)?.name : undefined) ?? 'Khách',
        // Không còn ảnh đại diện từ nhà cung cấp danh tính — FE tự sinh avatar
        avatar: null as string | null,
        country: r.country || 'XX',
        at: r.createdAt,
      })),
      byCountry,
    };
  }

  async deleteQna(id: string) {
    try {
      return await this.db.qnaQuestion.delete({ where: { id } });
    } catch (e: any) {
      // P2025 record not found
      if (e?.code === 'P2025') throw new NotFoundException('QNA not found');
      throw e;
    }
  }

  /**
   * Trả lời câu hỏi QNA qua email. Admin chỉ nhập lời nhắn —
   * tiêu đề, chào hỏi và chữ ký do template chuyên nghiệp tự lo.
   */
  async replyQna(id: string, message: string) {
    const q = await this.db.qnaQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('QNA not found');
    const cleanMessage = String(message ?? '').trim();
    if (!cleanMessage) throw new BadRequestException('Lời nhắn không được rỗng');

    const subject = '[GoCode] Phản hồi câu hỏi của bạn';
    const text =
      `Chào ${q.name},\n\n` +
      `Cảm ơn bạn đã gửi câu hỏi đến GoCode.\n\n` +
      `${cleanMessage}\n\n` +
      `---\nCâu hỏi của bạn: "${q.question}"\n\n` +
      `Trân trọng,\nĐội ngũ GoCode`;
    const html =
      `<p>Chào ${escapeHtml(q.name)},</p>` +
      `<p>Cảm ơn bạn đã gửi câu hỏi đến GoCode.</p>` +
      `<p>${escapeHtml(cleanMessage).replace(/\n/g, '<br/>')}</p>` +
      `<hr/><p><i>Câu hỏi của bạn: "${escapeHtml(q.question)}"</i></p>` +
      `<p>Trân trọng,<br/>Đội ngũ GoCode</p>`;

    // Gửi qua SMTP của Brevo — cùng bộ ba biến với `AuthMailer`, không phải hai
    // kiểu cấu hình mail trong cùng một backend. Nhánh Mailtrap Sending API
    // (`MAIL_API_TOKEN`) đã bỏ hẳn: domain demo chỉ gửi được tới email chủ tài
    // khoản, nên trả lời QNA "thành công" trong khi thư không bao giờ tới nơi.
    const login = (process.env.BREVO_SMTP_LOGIN ?? '').trim();
    const key = (process.env.BREVO_SMTP_KEY ?? '').trim();
    const from = (process.env.MAIL_FROM ?? '').trim();
    const thieu = [
      ...(login ? [] : ['BREVO_SMTP_LOGIN']),
      ...(key ? [] : ['BREVO_SMTP_KEY']),
      ...(from ? [] : ['MAIL_FROM']),
    ];
    if (thieu.length > 0) {
      throw new BadRequestException(
        `Chưa cấu hình gửi mail qua Brevo — thiếu ${thieu.join(', ')}. `
        + 'Lấy ở Brevo → Senders & Domains (phải xác minh) và Brevo → SMTP & API.',
      );
    }
    if (key.startsWith('xkeysib-')) {
      throw new BadRequestException(
        'BREVO_SMTP_KEY đang là API key (xkeysib-…) chứ không phải SMTP key (xsmtpsib-…). '
        + 'Hai loại khoá này không dùng thay nhau được.',
      );
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: login, pass: key },
    });
    let info: { messageId?: string };
    try {
      info = (await transporter.sendMail({
        from: from,
        to: q.email,
        subject,
        text,
        html,
      })) as { messageId?: string };
    } catch (err) {
      throw new BadRequestException(
        `Brevo lỗi: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
      );
    }
    this.logger.log(`Đã gửi reply QNA ${id} tới ${q.email} qua Brevo (${info?.messageId ?? 'no-id'})`);
    return { ok: true, to: q.email, messageId: info?.messageId ?? null };
  }

  // ---- Users ----

  /** Danh sách học viên từ bảng `User` — chỉ cột cần cho admin, không lộ passwordHash. */
  async listUsers(opts?: { limit?: number; offset?: number; query?: string }) {
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const where: Record<string, unknown> = {};
    const query = opts?.query?.trim();
    if (query) {
      // Lọc phía Postgres (ILIKE) thay vì kéo cả bảng về filter tay
      const or: Record<string, unknown>[] = [
        { email: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ];
      const asId = Number(query);
      if (Number.isInteger(asId)) or.push({ id: asId });
      where['OR'] = or;
    }
    const [rows, totalCount] = await Promise.all([
      this.db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      }),
      this.db.user.count({ where }),
    ]);
    return {
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
      totalCount,
      hasMore: rows.length === limit,
    };
  }

  // ---- Problems ----

  // ---- Submissions (xem ai nộp + code) ----

  async listSubmissions(opts?: {
    limit?: number;
    offset?: number;
    problemSlug?: string;
    query?: string;
  }) {
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const where: Record<string, unknown> = {};
    if (opts?.problemSlug) where['problemSlug'] = opts.problemSlug;
    const [rows, total] = await Promise.all([
      this.db.submission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.db.submission.count({ where }),
    ]);
    // resolve userId -> thông tin user 1 lần duy nhất từ bảng `User`
    const ids = [...new Set(rows.map((r) => r.userId))];
    const userMap = await this.resolveUsers(ids);
    const q = opts?.query?.trim().toLowerCase();
    let items = rows.map((r) => ({ ...r, user: userMap[r.userId] ?? null }));
    if (q) {
      items = items.filter((it) => {
        const u = it.user;
        return (
          it.problemSlug.toLowerCase().includes(q) ||
          (u?.email ?? '').toLowerCase().includes(q) ||
          (u?.name ?? '').toLowerCase().includes(q)
        );
      });
    }
    return { items, total };
  }

  private async resolveUsers(ids: number[]): Promise<Record<number, { id: number; email: string; name: string | null }>> {
    if (ids.length === 0) return {};
    const users = await this.db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, email: true, name: true },
    });
    const map: Record<number, { id: number; email: string; name: string | null }> = {};
    for (const u of users) map[u.id] = u;
    return map;
  }

  async listProblems() {
    return this.db.problem.findMany({ orderBy: { createdAt: 'asc' } });
  }

  async getProblem(slug: string) {
    const p = await this.db.problem.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException('Problem not found');
    return p;
  }

  async updateProblem(slug: string, dto: CreateProblemDto) {
    const existing = await this.db.problem.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Problem not found');
    // nếu đổi slug mới, kiểm tra trùng
    if (dto.slug !== slug) {
      const dup = await this.db.problem.findUnique({ where: { slug: dto.slug } });
      if (dup) throw new ConflictException('Slug mới đã tồn tại');
    }
    if (!/^[a-z0-9-]+$/.test(dto.slug)) throw new BadRequestException('slug must match /^[a-z0-9-]+$/');
    if (!['Dễ', 'Trung bình', 'Khó'].includes(dto.difficulty as string)) throw new BadRequestException('difficulty invalid');
    if (!Array.isArray(dto.tests) || dto.tests.length !== 3) throw new BadRequestException('tests phải có đúng 3');
    if (!Array.isArray(dto.hiddenTests) || dto.hiddenTests.length !== 10) throw new BadRequestException('hiddenTests phải có đúng 10');
    if (dto.status !== undefined && !['draft', 'pending', 'published'].includes(dto.status)) {
      throw new BadRequestException('status không hợp lệ');
    }

    const normalizeTests = (arr: any[]): any[] =>
      arr.map((t) => {
        if (t && typeof t.stdin === 'string' && typeof t.expected === 'string') return { stdin: t.stdin, expected: t.expected };
        if (t && typeof t.input === 'string' && typeof t.output === 'string') return { stdin: t.input, expected: t.output };
        return t;
      });
    const tests = normalizeTests(dto.tests as any[]);
    const hiddenTests = normalizeTests(dto.hiddenTests as any[]);

    const data: any = {
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      difficulty: dto.difficulty,
      topic: dto.topic,
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      inputFormat: dto.inputFormat ?? '',
      outputFormat: dto.outputFormat ?? '',
      constraints: dto.constraints ?? [],
      examples: dto.examples ?? [],
      tests,
      hiddenTests,
      starterCodes: (dto as any).starterCodes ?? {},
      timeLimit: dto.timeLimit ?? 1000,
      memoryLimit: dto.memoryLimit ?? 256000,
    };
    return this.db.problem.update({ where: { slug }, data });
  }

  /** Duyệt xuất bản: draft/pending -> published */
  async approveProblem(slug: string) {
    const existing = await this.db.problem.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Problem not found');
    return this.db.problem.update({ where: { slug }, data: { status: 'published' } });
  }

  /** Gỡ xuất bản: published -> draft */
  async unpublishProblem(slug: string) {
    const existing = await this.db.problem.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Problem not found');
    return this.db.problem.update({ where: { slug }, data: { status: 'draft' } });
  }

  /**
   * Bật/tắt cờ VIP của một bài.
   *
   * Endpoint riêng thay vì trường trong `PUT /problems/:slug` — xem
   * `dto/set-problem-vip.dto.ts` để biết ba lý do.
   *
   * @param isVip kiểu `unknown` cố ý: `ValidationPipe` chặn giá trị sai kiểu ở
   * tầng HTTP, nhưng service cũng phải tự chặn được vì nó là nơi **quyết định**
   * được ghi gì xuống cột `isVip`. Chuỗi `"false"` là chuỗi truthy — nếu lọt
   * tới đây thì lệnh "gỡ cờ VIP" của admin lại bật cờ VIP. Fail-closed ở cả hai
   * tầng, tầng dưới không tin tầng trên.
   */
  async setProblemVip(slug: string, isVip: unknown) {
    if (typeof isVip !== 'boolean') {
      throw new BadRequestException('isVip phải là boolean (true/false), không phải chuỗi');
    }
    // `findUnique` + `NotFoundException` chứ không để Prisma ném `P2025`: slug
    // không có là câu trả lời 404, không phải 500.
    const existing = await this.db.problem.findUnique({
      where: { slug },
      select: { slug: true, isVip: true },
    });
    if (!existing) throw new NotFoundException('Problem not found');

    const updated = await this.db.problem.update({
      where: { slug },
      data: { isVip },
      select: { slug: true, isVip: true },
    });

    // Xoá cache **trước** khi trả lời: nếu để sót, người thường còn đọc được đề
    // bài vừa khoá tới hết TTL. Cache `problems:slug:<slug>` giữ nguyên cột
    // `isVip` và `findBySlug` chấn chấn bằng đúng bản cache đó.
    //
    // `await` là bắt buộc, không phải cho đàng hoàng: `cache-manager` xoá bất
    // đồng bộ, nên gọi mà không `await` thì hàm này trả lời admin trước khi cache
    // thực sự sạch — request thường gửi ngay sau đó vẫn lấy được đề VIP.
    await this.problems?.invalidateProblemCache(slug);

    const from = readIsVipFlag(existing.isVip);
    // Cột `isVip` trong JWT là chuyện của `User` — dòng log này chỉ ghi bài nào
    // đổi cờ, không đụng tới `roleForToken` hay logic hạ VIP của user.
    this.logger.log(`Admin bật/tắt VIP: ${slug} ${from ? 'true -> false' : 'false -> true'}`);
    return { slug: updated.slug, isVip: readIsVipFlag(updated.isVip) };
  }

  async deleteProblem(slug: string) {
    try {
      return await this.db.problem.delete({ where: { slug } });
    } catch (e: any) {
      if (e?.code === 'P2025') throw new NotFoundException('Problem not found');
      throw e;
    }
  }

  async createProblem(dto: CreateProblemDto) {
    // manual validation fallback (also class-validator via ValidationPipe)
    if (!/^[a-z0-9-]+$/.test(dto.slug)) {
      throw new BadRequestException('slug must match /^[a-z0-9-]+$/');
    }
    if (!['Dễ', 'Trung bình', 'Khó'].includes(dto.difficulty as string)) {
      throw new BadRequestException('difficulty must be one of Dễ, Trung bình, Khó');
    }
    if (!dto.topic || typeof dto.topic !== 'string' || dto.topic.trim().length === 0) {
      throw new BadRequestException('topic should not be empty');
    }
    if (!dto.title || dto.title.trim().length === 0) {
      throw new BadRequestException('title should not be empty');
    }
    if (!dto.description || dto.description.trim().length === 0) {
      throw new BadRequestException('description should not be empty');
    }
    if (!Array.isArray(dto.tests) || dto.tests.length !== 3) {
      throw new BadRequestException('tests phải có đúng 3 test visible');
    }
    if (!Array.isArray(dto.hiddenTests) || dto.hiddenTests.length !== 10) {
      throw new BadRequestException('hiddenTests phải có đúng 10 test ẩn');
    }
    const status = dto.status ?? 'draft';
    if (!['draft', 'pending', 'published'].includes(status)) {
      throw new BadRequestException('status không hợp lệ');
    }

    const exists = await this.db.problem.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException('Slug đã tồn tại');

    // normalize tests: support {input,output} or {stdin, expected}
    const normalizeTests = (arr: any[]): any[] =>
      arr.map((t) => {
        if (t && typeof t.stdin === 'string' && typeof t.expected === 'string') {
          return { stdin: t.stdin, expected: t.expected };
        }
        if (t && typeof t.input === 'string' && typeof t.output === 'string') {
          return { stdin: t.input, expected: t.output };
        }
        // fallback keep as is
        return t;
      });

    const tests = normalizeTests(dto.tests as any[]);
    const hiddenTests = normalizeTests(dto.hiddenTests as any[]);

    const data: any = {
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      difficulty: dto.difficulty,
      topic: dto.topic,
      status,
      inputFormat: dto.inputFormat ?? '',
      outputFormat: dto.outputFormat ?? '',
      constraints: dto.constraints ?? [],
      examples: dto.examples ?? [],
      tests,
      hiddenTests,
      starterCodes: (dto as any).starterCodes ?? {},
      timeLimit: dto.timeLimit ?? 1000,
      memoryLimit: dto.memoryLimit ?? 256000,
    };

    try {
      return await this.db.problem.create({ data });
    } catch (e: any) {
      // unique constraint fallback
      if (e?.code === 'P2002') throw new ConflictException('Slug đã tồn tại');
      throw e;
    }
  }
}
