import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Optional,
  Inject,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createClerkClient } from '@clerk/backend';
import { DatabaseService } from '../database/database.service.ts';
import { CreateProblemDto } from './dto/create-problem.dto.ts';
import { PresenceService } from '../presence/presence.service.ts';

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    @Optional()
    @Inject(PresenceService)
    private readonly presence?: PresenceService,
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
    else if (plain) ok = password === plain;
    else throw new UnauthorizedException('Missing password env');
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
    // Fallback: token HS256 cũ ký bằng JWT_SECRET (giai đoạn chuyển đổi)
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

    // online via PresenceService or fetch fallback
    let online: number | null = null;
    if (this.presence) {
      try {
        online = this.presence.count();
      } catch {
        online = null;
      }
    }
    if (online === null) {
      try {
        const base = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const r = await fetch(`${base.replace(/\/$/, '')}/api/presence/online`);
        if (r.ok) {
          const j = (await r.json()) as any;
          if (typeof j.online === 'number') online = j.online;
          else if (typeof j.count === 'number') online = j.count;
        }
      } catch {
        // ignore, keep null
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
    };
  }

  async listQna() {
    return this.db.qnaQuestion.findMany({ orderBy: { createdAt: 'desc' } });
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

  // ---- Users (Clerk) ----

  async listUsers(opts?: { limit?: number; offset?: number; query?: string }) {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new BadRequestException('Chưa cấu hình CLERK_SECRET_KEY');
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const query = opts?.query?.trim() || undefined;
    const res = await clerk.users.getUserList({ limit, offset });
    // Clerk getUserList không hỗ trợ query tổng quát — filter local
    let users = res.data;
    if (query) {
      const q = query.toLowerCase();
      users = users.filter((u: any) => {
        const email = (u.emailAddresses?.[0]?.emailAddress ?? '').toLowerCase();
        const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
        const username = (u.username ?? '').toLowerCase();
        const id = (u.id ?? '').toLowerCase();
        return email.includes(q) || name.includes(q) || username.includes(q) || id.includes(q);
      });
    }
    return {
      users: users.map((u: any) => ({
        id: u.id,
        username: u.username ?? u.emailAddresses?.[0]?.emailAddress?.split('@')[0] ?? '',
        email: u.emailAddresses?.[0]?.emailAddress ?? '',
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        imageUrl: u.imageUrl ?? '',
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
        publicMetadata: u.publicMetadata ?? {},
        role: (u.publicMetadata as any)?.role ?? 'user',
      })),
      totalCount: res.totalCount,
      hasMore: users.length === limit,
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
    // resolve clerkId -> user info 1 lần duy nhất
    const ids = [...new Set(rows.map((r) => r.clerkId).filter(Boolean))];
    const userMap = await this.resolveUsers(ids);
    const q = opts?.query?.trim().toLowerCase();
    let items = rows.map((r) => ({ ...r, user: userMap[r.clerkId] ?? null }));
    if (q) {
      items = items.filter((it) => {
        const u = it.user as any;
        return (
          it.problemSlug.toLowerCase().includes(q) ||
          (u?.email ?? '').toLowerCase().includes(q) ||
          `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.toLowerCase().includes(q) ||
          (u?.username ?? '').toLowerCase().includes(q)
        );
      });
    }
    return { items, total };
  }

  private async resolveUsers(ids: string[]): Promise<Record<string, any>> {
    const map: Record<string, any> = {};
    if (ids.length === 0) return map;
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) return map;
    try {
      const clerk = createClerkClient({ secretKey: clerkSecretKey });
      const res = await clerk.users.getUserList({ userId: ids, limit: Math.min(ids.length, 100) });
      for (const u of res.data as any[]) {
        map[u.id] = {
          id: u.id,
          username: u.username ?? u.emailAddresses?.[0]?.emailAddress?.split('@')[0] ?? '',
          email: u.emailAddresses?.[0]?.emailAddress ?? '',
          firstName: u.firstName ?? '',
          lastName: u.lastName ?? '',
          imageUrl: u.imageUrl ?? '',
        };
      }
    } catch {
      // Clerk lỗi thì vẫn trả submissions với user=null
    }
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
