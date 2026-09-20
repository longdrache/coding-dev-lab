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
      expiresIn: '7d',
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

  // ---- Task 3 methods ----

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

    // activity last 30d
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // reset to start of day for consistent filtering
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    let activity30d: any[] = [];
    try {
      activity30d = await this.db.activityDay.findMany({
        where: { date: { gte: thirtyDaysAgo } },
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

    return {
      online,
      counts: { problems, qna, submissions },
      activity30d,
      topProblems,
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

  async listUsers(opts?: { limit?: number; offset?: number; query?: string }) {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) throw new BadRequestException('Chưa cấu hình CLERK_SECRET_KEY');
    const clerk = createClerkClient({ secretKey: clerkSecretKey });
    const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
    const offset = Math.max(opts?.offset ?? 0, 0);
    const query = opts?.query?.trim() || undefined;
    const res = await clerk.users.getUserList({ limit, offset, ...(query ? { query } as any : {}), ...(query ? { emailAddress: [query] } as any : {}) });
    // Clerk getUserList may ignore query if not supported, fallback filter locally
    let users = res.data;
    if (query) {
      const q = query.toLowerCase();
      users = users.filter((u: any) => {
        const email = (u.emailAddresses?.[0]?.emailAddress ?? "").toLowerCase();
        const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        const id = (u.id ?? "").toLowerCase();
        return email.includes(q) || name.includes(q) || id.includes(q);
      });
    }
    return {
      users: users.map((u: any) => ({
        id: u.id,
        username: u.username ?? u.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "",
        email: u.emailAddresses?.[0]?.emailAddress ?? "",
        firstName: u.firstName ?? "",
        lastName: u.lastName ?? "",
        imageUrl: u.imageUrl ?? "",
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
        publicMetadata: u.publicMetadata ?? {},
        role: (u.publicMetadata as any)?.role ?? "user",
      })),
      totalCount: res.totalCount,
      hasMore: users.length === limit,
    };
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
