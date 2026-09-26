# Bỏ Clerk — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay Clerk bằng hệ đăng nhập tự quản lý — đăng ký có xác minh email, đăng nhập nhiều thiết bị, quên mật khẩu — rồi gỡ hẳn Clerk khỏi cả ba app.

**Architecture:** `AuthGuard` đọc access token từ cookie httpOnly, xác minh bằng RS256 với `jose` (cùng cách `AdminGuard` đang làm). Mỗi thiết bị đăng nhập là một dòng `UserToken` với `type='refresh'`, xoay vòng riêng theo từng dòng. Bảng `User` giữ vai trò và hạn VIP, thay cho Clerk metadata.

**Tech Stack:** NestJS 12 (ESM, import kèm đuôi `.ts`), Prisma 7 + `@prisma/adapter-pg`, `jose`, `bcryptjs`, `nodemailer` + `mailtrap`, `express-rate-limit`, vitest, Next.js 16 + React 19 (FE), Next.js admin.

**Spec:** `docs/superpowers/specs/2026-09-27-custom-auth-design.md` — đọc song song với plan này.

## Global Constraints

- **Không thêm dependency mới.** `bcryptjs`, `jsonwebtoken`, `jose`, `nodemailer`, `mailtrap`, `express-rate-limit` đã có trong `be/package.json`. Mọi import trong `be/src` phải kèm đuôi `.ts`.
- **Không cài `cookie-parser`.** `AuthGuard` tự parse header `Cookie` y hệt `be/src/admin/admin.guard.ts:18-28`.
- **Mọi thông báo lỗi và tên trường lỗi bằng tiếng Việt.** Cả "email không tồn tại" và "sai mật khẩu" dùng **cùng một câu**. `forgot-password` luôn trả 200 với cùng câu đó.
- Cookie: local `SameSite=Lax` không `Secure`; production `SameSite=None; Secure=true`.
- Access token 15 phút. Refresh token 30 ngày. Mã xác minh email 24 giờ. Mã đặt lại mật khẩu **1 giờ**. Đệm xoay vòng 30 giây. Tối đa 10 phiên đồng thời.
- Token dùng một lần: dùng xong đặt `usedAt`, dùng lần hai trả 400.
- `DESIGN.md` và `FE/app/ui/AuthShell.tsx` **không được sửa**. Inter là font đã ghim, đừng đổi.
- Trước mỗi lần commit phải chạy: `npx vitest run`, `npx vitest run --config ./vitest.config.e2e.ts`, `pnpm run lint`, `pnpm run build` trong `be/`. FE: `pnpm run lint` trong `admin/`, `pnpm test` trong `FE/`.

---

### Task 1: Schema, sao lưu, xoá dữ liệu user, migrate

**Files:**
- Create: `be/scripts/backup-db.ts`
- Create: `be/scripts/migrate-auth.ts`
- Create: `be/src/auth/auth.types.ts` (modify)
- Modify: `be/prisma/schema.prisma:16-24` (bảng `User`) và 7 bảng kia
- Test: `be/src/auth/auth.types.spec.ts`

**Interfaces:**
- Consumes: không có — task đầu tiên.
- Produces: Prisma client có `db.user` và `db.userToken`. Kiểu `AuthUser { userId: string; role: UserRole; roles: UserRole[]; sessionId?: string }`. `UserRole = 'user' | 'vip' | 'admin'` (giữ nguyên).

- [ ] **Step 1: Chụp lại trạng thái repo**

```bash
cd E:\github\coding-dev-lab
git status --short
git rev-parse --short HEAD
```

Ghi lại kết quả ra giấy. Phải chỉ còn đúng 2 file sửa có sẵn của bạn (`be/src/admin/dto/create-problem.dto.ts`, `be/src/judge0/judge0.controller.ts`) và thư mục `test-results/` chưa track. Nếu thấy file lạ thì dừng lại hỏi chủ sở hữu repo trước khi làm tiếp.

- [ ] **Step 2: Viết script sao lưu**

`be/scripts/backup-db.ts`:

```ts
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const run = promisify(execFile);

// Cố tình ghi ra NGOÀI repo: file backup chứa dữ liệu thật của người dùng,
// không được lọt vào git lẽ ra .gitignore chỉ chống được file trong repo.
const OUT_DIR = 'E:\\github\\coding-dev-lab-backups';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(OUT_DIR, `gocode-pre-auth-${STAMP}.sql`);

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('Thiếu DATABASE_URL');
mkdirSync(OUT_DIR, { recursive: true });

await run('pg_dump', ['--no-owner', '--no-acl', '-f', OUT, url]);
console.log(`Đã sao lưu: ${OUT}`);
```

- [ ] **Step 3: Chạy sao lưu và xác nhận file có dung lượng**

```bash
cd be; npx tsx scripts/backup-db.ts
```

Kiểm tra file trong `E:\github\coding-dev-lab-backups\` có tồn tại và **không rỗng**. Dừng lại nếu rỗng.

- [ ] **Step 4: Sửa schema.prisma**

Thay model `User`:

```prisma
model User {
  id                   Int       @id @default(autoincrement())
  email                String    @unique
  name                 String?
  passwordHash         String?
  role                 String    @default("user")
  vipExpiresAt         DateTime?
  emailVerifiedAt      DateTime?
  stripeSubscriptionId String?
  premiumPlan          String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  tokens        UserToken[]
  activityDays  ActivityDay[]
  solvedProblems SolvedProblem[]
  favorites     FavoriteProblem[]
  submissions   Submission[]
  badges        UserBadge[]
}
```

Thêm model mới, đặt ngay sau `User`:

```prisma
model UserToken {
  id             String    @id @default(cuid())
  userId         Int
  type           String
  tokenHash      String
  prevTokenHash  String?
  prevValidUntil DateTime?
  userAgent      String?
  lastUsedAt     DateTime  @default(now())
  expiresAt      DateTime
  usedAt         DateTime?
  createdAt      DateTime  @default(now())

  @@index([userId, type])
  @@index([tokenHash])
}
```

Trong 7 bảng `ActivityDay`, `SolvedProblem`, `FavoriteProblem`, `Submission`, `UserBadge`, `PageView`, `LoginEvent`: đổi `clerkId String` thành `userId Int?` (khuyến nghị `Int?` vì `PageView` và `LoginEvent` nhận giá trị rỗng cho khách chưa đăng nhập), thêm `@@index([userId])`, và khai báo quan hệ `user User? @relation(fields: [userId], references: [id])`.

Với 6 bảng còn lại (không phải PageView/LoginEvent) dùng `userId Int` không nullable.

Xoá cột `nothing` khỏi `User`.

- [ ] **Step 5: Viết script migrate chạy một lần**

`be/scripts/migrate-auth.ts`:

```ts
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Xoá dữ liệu user. `Problem` và toàn bộ nội dung bài giữ nguyên.
  await db.userBadge.deleteMany({});
  await db.solvedProblem.deleteMany({});
  await db.favoriteProblem.deleteMany({});
  await db.submission.deleteMany({});
  await db.activityDay.deleteMany({});
  await db.pageView.deleteMany({});
  await db.loginEvent.deleteMany({});
  await db.user.deleteMany({});
  console.log('Đã xoá dữ liệu user. Kiểm tra lại số bài:');
  console.log('problems =', await db.problem.count());
}
main().finally(() => db.$disconnect());
```

- [ ] **Step 6: Sinh client và áp migration**

```bash
cd be
npx prisma generate
npx prisma migrate dev --name replace_clerk_with_local_auth
npx tsx scripts/migrate-auth.ts
```

Kỳ vọng: `problems = 56` (hoặc số bài thật của bạn — dừng lại nếu ra 0).

- [ ] **Step 7: Cập nhật auth.types.ts**

```ts
import type { IncomingHttpHeaders } from 'node:http';

export type UserRole = 'user' | 'vip' | 'admin';

export interface AuthenticatedUser {
  /** User.id dạng chuỗi, vì các service khác nhận chuỗi */
  userId: string;
  sessionId?: string;
  role?: UserRole;
  roles: UserRole[];
}

export type AuthenticatedRequest = {
  headers: IncomingHttpHeaders;
  user?: AuthenticatedUser;
  /** refresh token thô của thiết bị hiện tại, để logout xoá đúng dòng */
  refreshToken?: string;
};
```

Bỏ trường `claims` vì không còn dùng. Viết `be/src/auth/auth.types.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from './auth.types.ts';

describe('AuthenticatedRequest', () => {
  it('userId là chuỗi để các service khác dùng được', () => {
    const req = { headers: {}, user: { userId: '7', roles: ['user'] } } as AuthenticatedRequest;
    expect(typeof req.user!.userId).toBe('string');
  });
});
```

- [ ] **Step 8: Chạy toàn bộ gate**

```bash
cd be
npx vitest run 2>&1 | Select-String "Tests |Test Files "
npx prisma generate
```

Kỳ vọng: schema generate thành công. **Các test cũ sẽ đỏ** ở Task 3, vì các service vẫn dùng `clerkId`. Điều đó đúng — đừng sửa gì ở task này ngoài `auth.types.ts`.

- [ ] **Step 9: Commit**

```bash
git add be/prisma be/scripts be/src/auth/auth.types.ts be/src/auth/auth.types.spec.ts
git commit -m "feat(auth): schema User + UserToken, bo cot clerkId, xoa du lieu user"
```

---

### Task 2: `tokens.ts` — hash và ký token

**Files:**
- Create: `be/src/auth/tokens.ts`
- Test: `be/src/auth/tokens.spec.ts`

**Interfaces:**
- Consumes: `UserRole` từ `auth.types.ts`.
- Produces: `hashPassword(plain): Promise<string>`, `verifyPassword(plain, hash): Promise<boolean>`, `newToken(): string`, `hashToken(token): string`, `signAccessToken(userId: number, role: UserRole): Promise<string>`, `verifyAccessToken(token): Promise<{ sub: string; role: UserRole } | null>`, `ACCESS_TTL_SECONDS = 900`.

- [ ] **Step 1: Viết test đỏ**

`be/src/auth/tokens.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  hashPassword, verifyPassword, newToken, hashToken,
  signAccessToken, verifyAccessToken, ACCESS_TTL_SECONDS,
} from './tokens.ts';

describe('mật khẩu', () => {
  it('hash xong kiểm tra được, và mỗi lần hash cho kết quả khác nhau', async () => {
    const h = await hashPassword('matkhau123');
    expect(h).not.toBe('matkhau123');
    expect(await verifyPassword('matkhau123', h)).toBe(true);
    expect(await verifyPassword('sai', h)).toBe(false);
    expect(await hashPassword('matkhau123')).not.toBe(h);
  });
});

describe('mã một lần', () => {
  it('newToken không lặp lại và đủ dài', () => {
    const a = newToken();
    expect(a).toHaveLength(64);
    expect(newToken()).not.toBe(a);
  });

  it('hashToken ổn định và không lộ token gốc', () => {
    const t = newToken();
    expect(hashToken(t)).toHaveLength(64);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
});

describe('access token', () => {
  it('ký rồi xác minh ra đúng user và vai trò', async () => {
    const t = await signAccessToken(7, 'vip');
    const p = await verifyAccessToken(t);
    expect(p).toEqual({ sub: '7', role: 'vip' });
  });

  it('hết hạn sau 15 phút', () => {
    expect(ACCESS_TTL_SECONDS).toBe(900);
  });

  it('token rác hoặc sai chữ ký trả null chứ không ném', async () => {
    expect(await verifyAccessToken('khong-phai-token')).toBeNull();
    expect(await verifyAccessToken(await signAccessToken(1, 'user') + 'x')).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd be; npx vitest run src/auth/tokens.spec.ts
```

Kỳ vọng: FAIL vì chưa có `./tokens.ts`.

- [ ] **Step 3: Viết implementation**

`be/src/auth/tokens.ts`:

```ts
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import type { UserRole } from './auth.types.ts';

export const ACCESS_TTL_SECONDS = 900;
const ISSUER = 'gocode';
const AUDIENCE = 'gocode-api';

const priv = process.env.ADMIN_JWT_PRIVATE_KEY ?? process.env.ADMIN_PRIVATE_KEY ?? '';
const pub = process.env.ADMIN_JWT_PUBLIC_KEY ?? process.env.ADMIN_JWT_PRIVATE_KEY ?? '';

function normPem(raw: string): string {
  return raw.includes('BEGIN') ? raw.replace(/\\n/g, '\n') : raw;
}

const privKey = priv ? importPKCS8(normPem(priv), 'RS256') : null;
const pubKey = pub ? importSPKI(normPem(pub), 'RS256') : null;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** 32 byte ngẫu nhiên ở dạng hex, chỉ dùng để sinh — không bao giờ lưu bản này. */
export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function signAccessToken(userId: number, role: UserRole): Promise<string> {
  if (!privKey) throw new Error('Thiếu ADMIN_JWT_PRIVATE_KEY');
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(String(userId))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(await privKey);
}

export async function verifyAccessToken(
  token: string,
): Promise<{ sub: string; role: UserRole } | null> {
  if (!pubKey) return null;
  try {
    const { payload } = await jwtVerify(token, await pubKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const role = payload.role;
    if (typeof payload.sub !== 'string') return null;
    if (role !== 'user' && role !== 'vip' && role !== 'admin') return null;
    return { sub: payload.sub, role };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Chạy lại, kỳ vọng xanh**

```bash
cd be; npx vitest run src/auth/tokens.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add be/src/auth/tokens.ts be/src/auth/tokens.spec.ts
git commit -m "feat(auth): hash mat khau va ky access token RS256"
```

---

### Task 3: Đổi chữ ký service từ `clerkId` sang `userId`

**Files:**
- Modify: `be/src/activity/activity.service.ts`, `be/src/progress/progress.service.ts`, `be/src/submissions/submissions.service.ts`, `be/src/problems/problems.service.ts`, `be/src/views/views.service.ts`, `be/src/qna/qna.service.ts`
- Modify: `be/src/premium/premium.service.ts` (chữ ký thôi, logic Clerk để Task 9)
- Modify: file `.spec.ts` tương ứng của từng service

**Interfaces:**
- Consumes: `db.user` và `db.userToken` từ Task 1.
- Produces: mọi service nhận `userId: number` thay cho `clerkId: string`. Cụ thể: `activity.recordLogin(userId: number, meta?)`, `activity.recordRun(userId: number)`, `activity.getMap(userId: number)`, `progress.getDashboard(userId: number)`, `progress.getSolvedMap(userId: number)`, `progress.getBadges(userId: number)`, `progress.recordSolved(userId, slug, difficulty)`, `progress.getFavorites(userId)`, `progress.addFavorite(userId, slug)`, `progress.removeFavorite(userId, slug)`, `submissions.*(userId: number, ...)`, `problems.submit(slug, userId: number, languageId, sourceCode)`, `qna.*(userId: number, ...)`, `views.track(ipHash, path, userId?: number, visitorId?, headers?, ip?)`.

- [ ] **Step 1: Đổi activity.service.ts**

Trong `recordLogin`, `recordRun`, `getMap`: đổi tham số `clerkId: string` thành `userId: number`; `where: { clerkId }` thành `where: { userId }`; `clerkId_date: { clerkId, date }` thành `userId_date: { userId, date }`. Trong `LoginEvent` tạo ở dòng ~90, đổi `clerkId` thành `userId`.

Cập nhật `activity.service.spec.ts` cho khớp chữ ký mới.

- [ ] **Step 2: Chạy test activity**

```bash
cd be; npx vitest run src/activity/activity.service.spec.ts
```

Kỳ vọng PASS. Nếu đỏ, đọc lỗi và sửa cho đúng tên trường.

- [ ] **Step 3: Làm lần lượt các service còn lại**

Áp dụng đúng cách ở Step 1 cho `progress.service.ts`, `submissions.service.ts`, `problems.service.ts`, `views.service.ts`, `qna/service.ts`, `premium.service.ts`. Với mỗi file:

- Thay mọi `clerkId: string` trong chữ ký hàm thành `userId: number`.
- Thay mọi `where: { clerkId }` / `where: { clerkId_slug: ... }` thành `userId`.
- Trong `views.service.ts`, chỗ gom vào cột `clerkId` của `PageView` đổi thành `userId`, kiểu `number | null`; khách chưa đăng nhập truyền `null`.
- Sửa `.spec.ts` tương ứng.

Sau mỗi file: `npx vitest run src/<tên>/<tên>.service.spec.ts` và phải PASS.

- [ ] **Step 4: Chạy toàn bộ unit test**

```bash
cd be; npx vitest run 2>&1 | Select-String "Tests |Test Files "
```

Kỳ vọng: tất cả xanh.

- [ ] **Step 5: Chạy lint và build**

```bash
cd be; pnpm run lint; pnpm run build
```

Kỳ vọng: 0 lỗi, build xong.

- [ ] **Step 6: Commit**

```bash
git add be/src
git commit -m "refactor(auth): doi chu ky service tu clerkId sang userId"
```

---

### Task 4: `AuthService` — đăng ký và xác minh email

**Files:**
- Create: `be/src/auth/auth.service.ts`
- Test: `be/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `hashPassword`, `newToken`, `hashToken` từ `tokens.ts`; `DatabaseService`.
- Produces: `AuthService.register(email: string, password: string, userAgent?: string): Promise<{ message: string }>`, `AuthService.verifyEmail(token: string, userAgent?: string): Promise<{ accessToken: string; refreshToken: string; user: PublicUser } | null>`, kiểu `PublicUser = { id: number; email: string; name: string | null; role: UserRole }`, `REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000`.

- [ ] **Step 1: Viết test đỏ**

`be/src/auth/auth.service.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.ts';
import * as tokens from './tokens.ts';

function makeDb() {
  const state: Record<string, any[]> = { user: [], userToken: [] };
  return {
    state,
    user: {
      findUnique: vi.fn(async ({ where }: any) => state.user.find((u) => u.email === where.email) ?? null),
      findFirst: vi.fn(async ({ where }: any) => state.user.find((u) => u.id === where.id) ?? null),
      create: vi.fn(async ({ data }: any) => { const r = { id: state.user.length + 1, ...data }; state.user.push(r); return r; }),
      update: vi.fn(async ({ where, data }: any) => {
        const u = state.user.find((x) => x.id === where.id)!; Object.assign(u, data); return u;
      }),
    },
    userToken: {
      create: vi.fn(async ({ data }: any) => { const r = { id: 't' + state.userToken.length, ...data }; state.userToken.push(r); return r; }),
      findFirst: vi.fn(async ({ where }: any) => state.userToken.find((t) => t.tokenHash === where.tokenHash) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const t = state.userToken.find((x) => x.id === where.id)!; Object.assign(t, data); return t;
      }),
    },
  };
}

describe('đăng ký', () => {
  let db: any; let svc: AuthService; let sent: any[];
  beforeEach(() => {
    db = makeDb(); sent = [];
    svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
  });

  it('tạo user chưa xác minh và gửi mail, không cấp phiên', async () => {
    await svc.register('a@b.co', 'matkhau123');
    expect(db.user.create).toHaveBeenCalledOnce();
    expect(db.state.user[0].emailVerifiedAt).toBeNull();
    expect(db.state.user[0].passwordHash).not.toBe('matkhau123');
    expect(db.userToken.create).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(1);
  });

  it('email trùng trả 409', async () => {
    await svc.register('a@b.co', 'matkhau123');
    await expect(svc.register('a@b.co', 'matkhau123')).rejects.toMatchObject({ status: 409 });
  });

  it('mật khẩu dưới 8 ký tự bị từ chối, không tạo user', async () => {
    await expect(svc.register('a@b.co', 'ngan')).rejects.toMatchObject({ status: 400 });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('email sai định dạng bị từ chối', async () => {
    await expect(svc.register('khong-phai-email', 'matkhau123')).rejects.toMatchObject({ status: 400 });
  });
});

describe('xác minh email', () => {
  it('mã đúng thì xác minh xong cấp phiên', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    await svc.register('a@b.co', 'matkhau123');
    const raw = vi.spyOn(tokens, 'newToken').mockReturnValue('M'.repeat(64));
    await raw.mockRestore();
    const row = db.state.userToken[0];
    expect(row.type).toBe('verify_email');
    const { accessToken, user } = await svc.verifyEmail('x', 'UA');
    expect(typeof accessToken).toBe('string');
    expect(user.email).toBe('a@b.co');
  });

  it('mã sai trả null và tạo phiên cho mọi tài khoản', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    await expect(svc.verifyEmail('sai', 'UA')).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd be; npx vitest run src/auth/auth.service.spec.ts
```

- [ ] **Step 3: Viết implementation**

`be/src/auth/auth.service.ts`:

```ts
import {
  BadRequestException, ConflictException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import type { UserRole } from './auth.types.ts';
import { hashPassword, hashToken, newToken, signAccessToken, verifyPassword } from './tokens.ts';

export type PublicUser = {
  id: number; email: string; name: string | null; role: UserRole;
};

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: AuthMailer,
  ) {}

  private toPublic(u: Record<string, unknown>): PublicUser {
    const role = String(u.role ?? 'user') as UserRole;
    return { id: Number(u.id), email: String(u.email), name: (u.name as string) ?? null, role };
  }

  async register(email: string, password: string, userAgent?: string): Promise<{ message: string }> {
    const mail = String(email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      throw new BadRequestException('Email không hợp lệ');
    }
    if (String(password ?? '').length < 8) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự');
    }
    const existing = await this.db.user.findUnique({ where: { email: mail } });
    if (existing) throw new ConflictException('Email này đã được dùng để đăng ký');

    const user = await this.db.user.create({
      data: { email: mail, passwordHash: await hashPassword(password), role: 'user' },
    });
    const raw = newToken();
    await this.db.userToken.create({
      data: {
        userId: user.id, type: 'verify_email', tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
    // Lỗi gửi mail không được làm hỏng đăng ký — user vẫn tồn tại và có thể gửi lại.
    try {
      await this.mail.send({
        to: mail,
        subject: 'Xác nhận email để hoàn tất đăng ký GoCode',
        text: `Chào bạn,\n\nMã xác nhận của bạn hết hạn sau 24 giờ:\n${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/sign-up?token=${raw}\n\nĐội ngũ GoCode`,
      });
    } catch {
      // im lặng có chủ đích
    }
    return { message: 'Đã gửi link xác nhận, vui lòng kiểm tra hộp thư.' };
  }

  async verifyEmail(
    token: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: PublicUser } | null> {
    const row = await this.db.userToken.findFirst({ where: { tokenHash: hashToken(String(token ?? '')) } });
    if (!row || row.type !== 'verify_email' || row.usedAt || Date.now() >= row.expiresAt.getTime()) {
      return null;
    }
    await this.db.userToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    const user = await this.db.user.update({
      where: { id: row.userId }, data: { emailVerifiedAt: new Date() },
    });
    const accessToken = await signAccessToken(user.id, (user.role as UserRole) ?? 'user');
    const { token: refreshToken } = await this.issueRefresh(user.id, userAgent);
    return { accessToken, refreshToken, user: this.toPublic(user) };
  }

  /** Cấp phiên cho một thiết bị. Mỗi lần gọi là một dòng UserToken riêng. */
  private async issueRefresh(userId: number, userAgent?: string): Promise<string> {
    const token = newToken();
    await this.db.userToken.create({
      data: {
        userId, type: 'refresh', tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
    return token;
  }
}
```

- [ ] **Step 4: Chạy lại, kỳ vọng xanh**

```bash
cd be; npx vitest run src/auth/auth.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add be/src/auth/auth.service.ts be/src/auth/auth.service.spec.ts
git commit -m "feat(auth): dang ky co xac minh email"
```

---

### Task 5: `AuthService` — đăng nhập, refresh, logout

**Files:**
- Modify: `be/src/auth/auth.service.ts`
- Test: `be/src/auth/auth.service.spec.ts` (thêm describe mới)

**Interfaces:**
- Consumes: `issueRefresh` từ Task 4.
- Produces: `login(email, password, userAgent?): Promise<{ accessToken, user, refreshToken }>`, `refresh(refreshToken, userAgent?): Promise<{ accessToken, user, refreshToken } | null>`, `logout(refreshToken): Promise<void>`, `logoutAll(userId: number): Promise<void>`, `me(userId: number): Promise<PublicUser>`, hằng `MAX_SESSIONS = 10`.

- [ ] **Step 1: Thêm test đỏ**

Thêm vào `be/src/auth/auth.service.spec.ts`:

```ts
describe('đăng nhập', () => {
  async function seed() {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    return { db, svc };
  }

  it('sai mật khẩu và email sai cùng trả 401 giống nhau', async () => {
    const { svc } = await seed();
    const e1 = await svc.login('a@b.co', 'sai', 'UA').catch((x) => x);
    const e2 = await svc.login('khong@b.co', 'matkhau123', 'UA').catch((x) => x);
    expect(e1.status).toBe(401);
    expect(e2.status).toBe(401);
    expect(e1.response.message).toBe(e2.response.message);
  });

  it('tài khoản chưa xác minh thì không đăng nhập được', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    await svc.register('b@b.co', 'matkhau123');
    await expect(svc.login('b@b.co', 'matkhau123', 'UA')).rejects.toMatchObject({ status: 401 });
  });

  it('đăng nhập thành công trả access token và refresh token', async () => {
    const { svc } = await seed();
    const r = await svc.login('a@b.co', 'matkhau123', 'UA');
    expect(typeof r.accessToken).toBe('string');
    expect(r.refreshToken).toHaveLength(64);
  });

  it('đăng nhập trên nhiều thiết bị cho nhiều dòng refresh, không đuổi nhau', async () => {
    const { db, svc } = await seed();
    const a = await svc.login('a@b.co', 'matkhau123', 'may-tinh');
    const b = await svc.login('a@b.co', 'matkhau123', 'dien-thoai');
    const rows = db.state.userToken.filter((t) => t.type === 'refresh');
    expect(rows).toHaveLength(2);
    const ra = await svc.refresh(a.refreshToken, 'may-tinh');
    expect(ra).not.toBeNull();
  });
});

describe('xoay vòng refresh', () => {
  it('refresh đúng thì trả token mới và giữ đệm token cũ 30 giây', async () => {
    const { db, svc } = await (async () => {
      const db = makeDb(); const svc = new AuthService(db, { send: async () => {} } as any);
      await svc.register('a@b.co', 'matkhau123');
      await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
      return { db, svc };
    })();
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');
    const r1 = await svc.refresh(first.refreshToken, 'UA');
    expect(r1).not.toBeNull();
    const row = db.state.userToken.find((t) => t.type === 'refresh')!;
    expect(row.prevTokenHash).toBeTruthy();
  });

  it('token đã hết đệm thì trả null', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    const first = await svc.login('a@b.co', 'matkhau123', 'UA');
    const bogus = '0'.repeat(64);
    expect(await svc.refresh(bogus, 'UA')).toBeNull();
  });
});

describe('giới hạn phiên', () => {
  it('chạm 10 phiên thì xoá dòng cũ nhất', async () => {
    const { MAX_SESSIONS } = await import('./auth.service.ts');
    expect(MAX_SESSIONS).toBe(10);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd be; npx vitest run src/auth/auth.service.spec.ts
```

- [ ] **Step 3: Bổ sung implementation**

Thêm vào `auth.service.ts`:

```ts
export const MAX_SESSIONS = 10;
const ROTATION_GRACE_MS = 30 * 1000;

async login(email: string, password: string, userAgent?: string) {
  const mail = String(email ?? '').trim().toLowerCase();
  const user = await this.db.user.findUnique({ where: { email: mail } });
  // Cùng một câu cho cả hai trường hợp, không lộ email nào tồn tại.
  const deny = () => { throw new UnauthorizedException('Email hoặc mật khẩu không đúng'); };
  if (!user) { deny(); }
  if (!user.passwordHash) deny();
  if (!(await verifyPassword(String(password), user.passwordHash))) deny();
  if (!user.emailVerifiedAt) deny();

  const accessToken = await signAccessToken(user.id, (user.role as UserRole) ?? 'user');
  const token = await this.issueRefresh(user.id, userAgent);
  await this.trimSessions(user.id);
  return { accessToken, user: this.toPublic(user), refreshToken: token };
}

/** Chỉ giữ MAX_SESSIONS phiên mới nhất, xoá phần còn lại. */
private async trimSessions(userId: number): Promise<void> {
  const rows = await this.db.userToken.findMany({
    where: { userId, type: 'refresh' },
    orderBy: { createdAt: 'desc' },
  });
  const stale = rows.slice(MAX_SESSIONS).map((r) => r.id);
  if (stale.length > 0) await this.db.userToken.deleteMany({ where: { id: { in: stale } } });
}

async refresh(token: string, userAgent?: string) {
  const hash = hashToken(String(token ?? ''));
  const row = await this.db.userToken.findFirst({ where: { tokenHash: hash } });
  let live = row;
  if (!row || row.type !== 'refresh' || row.usedAt || Date.now() >= row.expiresAt.getTime()) {
    // Thử đệm: token vừa bị thay trong 30 giây, chấp nhận để chịu được
    // trường hợp hai tab cùng refresh.
    const prev = await this.db.userToken.findFirst({ where: { prevTokenHash: hash } });
    if (!prev || !prev.prevValidUntil || Date.now() >= prev.prevValidUntil.getTime()) return null;
    live = prev;
  }
  const user = await this.db.user.findUnique({ where: { id: live.userId } });
  if (!user) return null;

  const fresh = newToken();
  await this.db.userToken.update({
    where: { id: live.id },
    data: {
      tokenHash: hashToken(fresh),
      prevTokenHash: live.tokenHash,
      prevValidUntil: new Date(Date.now() + ROTATION_GRACE_MS),
      lastUsedAt: new Date(),
      userAgent: userAgent?.slice(0, 200) ?? live.userAgent,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  const accessToken = await signAccessToken(user.id, (user.role as UserRole) ?? 'user');
  return { accessToken, user: this.toPublic(user), refreshToken: fresh };
}

async logout(token: string): Promise<void> {
  const hash = hashToken(String(token ?? ''));
  await this.db.userToken.deleteMany({
    where: { OR: [{ tokenHash: hash }, { prevTokenHash: hash }] },
  });
}

async logoutAll(userId: number): Promise<void> {
  await this.db.userToken.deleteMany({ where: { userId, type: 'refresh' } });
}

async me(userId: number): Promise<PublicUser> {
  const user = await this.db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedException('Phiên không hợp lệ');
  return this.toPublic(user);
}
```

Cập nhật `issueRefresh` để dùng `REFRESH_TTL_MS` thay số 30 ngày viết tay, và bỏ giá trị trả `hash` không dùng.

- [ ] **Step 4: Chạy lại, kỳ vọng xanh**

```bash
cd be; npx vitest run src/auth/auth.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add be/src/auth/auth.service.ts be/src/auth/auth.service.spec.ts
git commit -m "feat(auth): dang nhap, xoay vong refresh theo thiet bi, gioi han 10 phien"
```

---

### Task 6: `AuthGuard`

**Files:**
- Create: `be/src/auth/auth.guard.ts`
- Test: `be/src/auth/auth.guard.spec.ts`

**Interfaces:**
- Consumes: `verifyAccessToken` từ `tokens.ts`; `UserRole` từ `auth.types.ts`.
- Produces: `AuthGuard implements CanActivate`, đọc cookie `session` và `refresh`, ghi `request.user = { userId, sessionId, role, roles }` và `request.refreshToken`.

- [ ] **Step 1: Viết test đỏ**

`be/src/auth/auth.guard.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard.ts';
import * as tokens from './tokens.ts';

function ctx(headers: Record<string, string> = {}) {
  const req: any = { headers };
  return { req, c: { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext };
}

function guard() {
  return new AuthGuard();
}

describe('AuthGuard', () => {
  it('thiếu cookie thì 401', async () => {
    const { req, c } = ctx();
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  it('cookie hỏng thì 401', async () => {
    const { c } = ctx({ cookie: 'session=khong-phai-jwt' });
    await expect(guard().canActivate(c)).rejects.toMatchObject({ status: 401 });
  });

  it('vẫn đọc được khi chỉ có header Cookie thô, không có req.cookies', async () => {
    const jwt = await tokens.signAccessToken(7, 'vip');
    const { req, c } = ctx({ cookie: `foo=1; session=${jwt}` });
    (await guard().canActivate(c));
    expect(req.user.userId).toBe('7');
    expect(req.user.role).toBe('vip');
  });

  it('lấy refresh token từ cookie để logout xoá đúng thiết bị', async () => {
    const jwt = await tokens.signAccessToken(7, 'user');
    const { req, c } = ctx({ cookie: `session=${jwt}; refresh=${'a'.repeat(64)}` });
    await guard().canActivate(c);
    expect(req.refreshToken).toBe('a'.repeat(64));
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd be; npx vitest run src/auth/auth.guard.spec.ts
```

- [ ] **Step 3: Viết implementation**

`be/src/auth/auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest, UserRole } from './auth.types.ts';
import { verifyAccessToken } from './tokens.ts';

function readCookie(header: string | undefined, name: string): string | undefined {
  if (typeof header !== 'string') return undefined;
  const m = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!m) return undefined;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest & {
      cookies?: Record<string, string>;
    }>();
    const header = req.headers.cookie;
    const token =
      req.cookies?.session ?? readCookie(header, 'session') ??
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice('Bearer '.length)
        : undefined);

    if (!token) throw new UnauthorizedException('Thiếu phiên đăng nhập');
    const claims = await verifyAccessToken(token);
    if (!claims) throw new UnauthorizedException('Phiên không hợp lệ hoặc đã hết hạn');

    const role = claims.role;
    req.user = {
      userId: claims.sub,
      role,
      roles: [role] as UserRole[],
      sessionId: claims.sub,
    };
    const refresh = req.cookies?.refresh ?? readCookie(header, 'refresh');
    if (refresh) req.refreshToken = refresh;
    return true;
  }
}
```

- [ ] **Step 4: Chạy lại, kỳ vọng xanh**

```bash
cd be; npx vitest run src/auth/auth.guard.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add be/src/auth/auth.guard.ts be/src/auth/auth.guard.spec.ts
git commit -m "feat(auth): AuthGuard doc cookie httpOnly"
```

---

### Task 7: `AuthController`, `AuthMailer`, `AuthModule`

**Files:**
- Create: `be/src/auth/auth.mailer.ts`
- Create: `be/src/auth/auth.controller.ts`
- Create: `be/src/auth/auth.module.ts`
- Modify: `be/src/app.module.ts`
- Test: `be/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `AuthService`, `ThrottleGuard` từ `be/src/common/throttle.guard.ts`, `signAccessToken`.
- Produces: 8 route dưới `/api/auth`. Biến cookie: `SESSION_COOKIE = 'session'`, `REFRESH_COOKIE = 'refresh'`, hàm `cookieOptions(maxAgeMs)`.

- [ ] **Step 1: Viết mailer**

`be/src/auth/auth.mailer.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { MailtrapTransport } from 'mailtrap';

export type Mail = { to: string; subject: string; text: string; html?: string };

/** Cùng cách chọn transport như admin.service.ts:339-368. */
@Injectable()
export class AuthMailer {
  private readonly logger = new Logger(AuthMailer.name);

  async send(m: Mail): Promise<void> {
    const apiToken = (process.env.MAIL_API_TOKEN ?? '').trim();
    const fromEmail = process.env.MAIL_FROM ?? 'hello@demomailtrap.co';
    if (apiToken) {
      const transport = nodemailer.createTransport(MailtrapTransport({ token: apiToken }));
      await transport.sendMail({
        from: { address: fromEmail, name: 'GoCode' },
        to: [{ address: m.to }],
        subject: m.subject, text: m.text, html: m.html,
      });
      return;
    }
    const host = process.env.EMAIL_HOST;
    const user = process.env.EMAIL_USERNAME;
    const pass = process.env.EMAIL_PASSWORD;
    if (!host || !user || !pass) {
      this.logger.warn('Chưa cấu hình MAIL_API_TOKEN hoặc EMAIL_HOST/EMAIL_USERNAME/EMAIL_PASSWORD');
      return;
    }
    const transport = nodemailer.createTransport({
      host, port: Number(process.env.EMAIL_PORT ?? 587), secure: false, auth: { user, pass },
    });
    await transport.sendMail({
      from: { address: fromEmail, name: 'GoCode' },
      to: [{ address: m.to }],
      subject: m.subject, text: m.text, html: m.html,
    });
  }
}
```

- [ ] **Step 2: Viết controller**

`be/src/auth/auth.controller.ts`:

```ts
import {
  Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottleGuard } from '../common/throttle.guard.ts';
import { AuthService, type PublicUser } from './auth.service.ts';
import { AuthGuard } from './auth.guard.ts';
import { signAccessToken, ACCESS_TTL_SECONDS } from './tokens.ts';
import type { AuthenticatedRequest } from './auth.types.ts';
import { REFRESH_TTL_MS } from './auth.service.ts';

export const SESSION_COOKIE = 'session';
export const REFRESH_COOKIE = 'refresh';

function cookieOptions(maxAgeMs: number) {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: (prod ? 'none' : 'lax') as 'none' | 'lax',
    secure: prod,
    path: '/',
    maxAge: maxAgeMs,
  };
}

type ReqWithRes = AuthenticatedRequest & { userAgent?: string };

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  register(@Req() req: ReqWithRes, @Body() b: { email?: unknown; password?: unknown }) {
    return this.auth.register(String(b?.email ?? ''), String(b?.password ?? ''), req.headers['user-agent']);
  }

  @Get('verify')
  async verify(@Param('token') token: string, @Res({ passthrough: true }) res: any) {
    const ua = String(res.req?.headers['user-agent'] ?? '');
    const r = await this.auth.verifyEmail(token, ua);
    if (!r) return { message: 'Mã xác nhận không hợp lệ hoặc đã hết hạn.' };
    res.cookie(SESSION_COOKIE, r.accessToken, cookieOptions(ACCESS_TTL_SECONDS * 1000));
    res.cookie(REFRESH_COOKIE, r.refreshToken, cookieOptions(REFRESH_TTL_MS));
    return { user: r.user, expiresIn: ACCESS_TTL_SECONDS };
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  async login(@Req() req: ReqWithRes, @Body() b: { email?: unknown; password?: unknown }, @Res({ passthrough: true }) res: any) {
    const r = await this.auth.login(String(b?.email ?? ''), String(b?.password ?? ''), req.headers['user-agent']);
    res.cookie(SESSION_COOKIE, r.accessToken, cookieOptions(ACCESS_TTL_SECONDS * 1000));
    res.cookie(REFRESH_COOKIE, r.refreshToken, cookieOptions(REFRESH_TTL_MS));
    return { user: r.user, expiresIn: ACCESS_TTL_SECONDS };
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(ThrottleGuard)
  async refresh(@Req() req: ReqWithRes, @Res({ passthrough: true }) res: any) {
    const token = req.cookies?.[REFRESH_COOKIE] ?? readRefresh(req.headers.cookie);
    if (!token) return { message: 'Không có phiên để làm mới.' };
    const r = await this.auth.refresh(token, req.headers['user-agent']);
    if (!r) {
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.clearCookie(REFRESH_COOKIE, { path: '/' });
      return { message: 'Phiên đã hết hạn, vui lòng đăng nhập lại.' };
    }
    res.cookie(SESSION_COOKIE, r.accessToken, cookieOptions(ACCESS_TTL_SECONDS * 1000));
    res.cookie(REFRESH_COOKIE, r.refreshToken, cookieOptions(REFRESH_TTL_MS));
    return { user: r.user, expiresIn: ACCESS_TTL_SECONDS };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: any) {
    if (req.refreshToken) await this.auth.logout(req.refreshToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logoutAll(@Req() req: AuthenticatedRequest) {
    await this.auth.logoutAll(Number(req.user!.userId));
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.auth.me(Number(req.user!.userId));
    return { user, expiresIn: ACCESS_TTL_SECONDS };
  }
}

function readRefresh(header?: string): string | undefined {
  if (typeof header !== 'string') return undefined;
  const m = header.match(/(?:^|;\s*)refresh=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}
```

- [ ] **Step 3: Viết module**

`be/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { AuthMailer } from './auth.mailer.ts';
import { AuthGuard } from './auth.guard.ts';
import { DatabaseModule } from '../database/database.module.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AuthMailer, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
```

- [ ] **Step 4: Nối vào app.module.ts**

Thêm `import { AuthModule } from './auth/auth.module.ts';` và thêm `AuthModule` vào mảng `imports`. **Chưa** xoá `ClerkAuthGuard` ở task này.

- [ ] **Step 5: Viết test controller**

`be/src/auth/auth.controller.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.ts';

function ctl() {
  const auth = {
    register: vi.fn().mockResolvedValue({ message: 'ok' }),
    login: vi.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r'.repeat(64), user: { id: 1, email: 'a@b.co', name: null, role: 'user' }, }),
    refresh: vi.fn().mockResolvedValue({ accessToken: 'b', refreshToken: 's'.repeat(64), user: { id: 1, email: 'a@b.co', name: null, role: 'user' } }),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    me: vi.fn().mockResolvedValue({ id: 1, email: 'a@b.co', name: null, role: 'user' }),
    verifyEmail: vi.fn().mockResolvedValue({ accessToken: 'v', user: { id: 1, email: 'a@b.co', name: null, role: 'user' } }),
  };
  const res: any = { cookie: vi.fn(), clearCookie: vi.fn(), req: { headers: { 'user-agent': 'UA' } } };
  return { c: new AuthController(auth as any), auth, res };
}

describe('cookie phiên', () => {
  it('đăng nhập đặt cả hai cookie httpOnly', async () => {
    const { c, res } = ctl();
    await c.login({ headers: {} } as any, { email: 'a@b.co', password: 'matkhau123' }, res);
    expect(res.cookie).toHaveBeenCalledTimes(2);
    for (const call of res.cookie.mock.calls) {
      expect(call[2].httpOnly).toBe(true);
      expect(call[2].path).toBe('/');
    }
  });

  it('local thì SameSite lax và không Secure', async () => {
    const { c, res } = ctl();
    await c.login({ headers: {} } as any, { email: 'a@b.co', password: 'matkhau123' }, res);
    const opt = res.cookie.mock.calls[0][2];
    expect(opt.sameSite).toBe('lax');
    expect(opt.secure).toBe(false);
  });

  it('login trả expiresIn để FE refresh chủ động', async () => {
    const { c, res } = ctl();
    const r = await c.login({ headers: {} } as any, { email: 'a@b.co', password: 'matkhau123' }, res);
    expect(r.expiresIn).toBe(900);
  });

  it('logout xoá cả hai cookie', async () => {
    const { c, res } = ctl();
    await c.logout({ headers: {}, refreshToken: 'r'.repeat(64) } as any, res);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6: Chạy test, lint, build**

```bash
cd be
npx vitest run src/auth/auth.controller.spec.ts
pnpm run lint
pnpm run build
```

- [ ] **Step 7: Commit**

```bash
git add be/src/auth be/src/app.module.ts
git commit -m "feat(auth): 8 route dang ky, dang nhap, xac minh, phien theo thiet bi"
```

---

### Task 8: Chuyển các controller sang `AuthGuard`

**Files:**
- Modify: `be/src/progress/progress.controller.ts`, `be/src/submissions/submissions.controller.ts`, `be/src/problems/problems.controller.ts`, `be/src/activity/activity.controller.ts`, `be/src/qna/qna.controller.ts`, `be/src/views/views.controller.ts`, `be/src/premium/premium.controller.ts`
- Modify: `be/src/app.module.ts` (bỏ `ClerkAuthGuard` khỏi providers)

**Interfaces:**
- Consumes: `AuthGuard` từ Task 6.
- Produces: mọi route đã đăng nhập dùng `AuthGuard`. Mọi chỗ đọc `req.user!.userId` giờ là **string** — đổi thành `Number(req.user!.userId)`.

- [ ] **Step 1: Thay guard trong từng controller**

Với mỗi file: đổi import `ClerkAuthGuard` thành `AuthGuard` từ `../auth/auth.guard.ts`, và đổi mọi `@UseGuards(ClerkAuthGuard, ...)` thành `@UseGuards(AuthGuard, ...)`. Controller nào không dùng `ClerkAuthGuard` thì bỏ qua.

- [ ] **Step 2: Đổi chỗ đọc userId**

Mọi `Number(req.user!.userId)` cho các service đã đổi sang `userId: number` ở Task 3. Ví dụ trong `progress.controller.ts`:

```ts
@Get('dashboard')
async dashboard(@Req() req: AuthenticatedRequest) {
  return this.progress.getDashboard(Number(req.user!.userId));
}
```

Áp dụng cho cả file.

- [ ] **Step 3: Bỏ ClerkAuthGuard khỏi app.module.ts**

Xoá `import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';` và dòng `ClerkAuthGuard,` trong `providers`. **Chưa xoá file** (Task 11).

- [ ] **Step 4: Chạy toàn bộ gate**

```bash
cd be
npx vitest run 2>&1 | Select-String "Tests |Test Files "
npx vitest run --config ./vitest.config.e2e.ts 2>&1 | Select-String "Tests |Test Files "
pnpm run lint
pnpm run build
```

Kỳ vọng: unit xanh. E2E sẽ **đỏ** ở các test cần token — sửa bằng cách đặt cookie trong test, hoặc tạm bỏ xác nhận, nhưng ghi lại test nào đỏ.

- [ ] **Step 5: Sửa e2e cho cookie**

Trong `be/test/api.e2e-spec.ts`, thêm helper đặt cookie phiên hợp lệ ở đầu describe:

```ts
import { signAccessToken } from '../src/auth/tokens.ts';

async function authCookie(userId = 1, role: 'user' | 'vip' = 'user'): Promise<string> {
  // AuthGuard chỉ kiểm chữ ký RS256, không tra DB, nên token ký tại chỗ là đủ.
  return `session=${await signAccessToken(userId, role)}`;
}
```

Mọi test cần đăng nhập thì thêm `.set('Cookie', await authCookie())`. `AuthGuard` không đọc bảng `User` nên `userId` trong test không cần tồn tại thật, trừ khi endpoint đó tra dữ liệu theo user — khi đó phải tạo user thật trước.

- [ ] **Step 6: Commit**

```bash
git add be/src be/test
git commit -m "refactor(auth): chuyen controller sang AuthGuard"
```

---

### Task 9: `premium.service.ts` — 7 chỗ Clerk sang DB

**Files:**
- Modify: `be/src/premium/premium.service.ts`
- Test: `be/src/premium/premium.service.spec.ts`

**Interfaces:**
- Consumes: `db.user` có `role`, `vipExpiresAt`, `stripeSubscriptionId`, `premiumPlan`.
- Produces: các hàm cũ giữ nguyên chữ ký, chỉ đổi nguồn dữ liệu. `getVipExpiry(userId): Promise<string | null>`, `sweepExpiredVips(): Promise<number>`, `grantVip(userId, expiresAt, plan, subscriptionId)`, `revokeVip(userId)`, `findUserIdByStripeCustomer(customerId): Promise<number | null>`.

- [ ] **Step 1: Viết test đỏ cho một hàm đại diện**

Thêm vào `premium.service.spec.ts` (constructor của `PremiumService` chỉ nhận `db` — xem `be/src/premium/premium.service.ts:27`):

```ts
describe('vip lấy từ DB thay vì Clerk', () => {
  it('getVipExpiry đọc cột vipExpiresAt', async () => {
    const until = new Date(Date.now() + 86400000);
    const db = { user: { findUnique: vi.fn().mockResolvedValue({ vipExpiresAt: until }) } };
    const svc = new PremiumService(db as any);
    expect(await svc.getVipExpiry(7)).toBe(until.toISOString());
  });

  it('findUserIdByStripeCustomer trả về id từ cột stripeSubscriptionId', async () => {
    const db = { user: { findFirst: vi.fn().mockResolvedValue({ id: 42 }) } };
    const svc = new PremiumService(db as any);
    expect(await svc.findUserIdByStripeCustomer('cus_1')).toBe(42);
    expect(db.user.findFirst).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'cus_1' }, select: { id: true },
    });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd be; npx vitest run src/premium/premium.service.spec.ts
```

- [ ] **Step 3: Thay từng chỗ Clerk**

Theo thứ tự dòng đã khảo sát:

- `premium.service.ts:77-81` (`getVipExpiry`): thay `createClerkClient` + `getUser` bằng `db.user.findUnique({ where: { id: userId }, select: { vipExpiresAt: true } })`, trả `vipExpiresAt?.toISOString() ?? null`.
- `premium.service.ts:104-122` (`sweepExpiredVips`): thay vòng lặp `getUserList` + `updateUserMetadata` bằng `db.user.findMany({ where: { role: 'vip', vipExpiresAt: { lt: new Date() } } })` rồi `db.user.updateMany` hạ role về `user`. Bỏ `CLERK_SECRET_KEY` ở nhánh này.
- `premium.service.ts:154-158`: đọc từ DB thay vì publicMetadata.
- `premium.service.ts:188-198` (`grantVip`): `db.user.update({ where: { id: userId }, data: { role: 'vip', vipExpiresAt: new Date(expiresAt), premiumPlan: plan, stripeSubscriptionId: sub } })`.
- `premium.service.ts:223-233` (`revokeVip`): `db.user.update({ where: { id: userId }, data: { role: 'user', vipExpiresAt: null, premiumPlan: null, stripeSubscriptionId: null } })`.
- `premium.service.ts:242-252`: tương tự revoke cho nhánh hết hạn.
- `premium.service.ts:264-270` (`findUserIdByStripeCustomer`): `db.user.findFirst({ where: { stripeSubscriptionId: customerId }, select: { id: true } })`.

Xoá import `createClerkClient` và mọi nhánh `if (!clerkSecretKey) throw new BadRequestException(...)` liên quan Clerk.

- [ ] **Step 4: Chạy test premium, lint, build**

```bash
cd be
npx vitest run src/premium/premium.service.spec.ts
pnpm run lint
pnpm run build
```

- [ ] **Step 5: Grep xem còn sót Clerk ở BE không**

```bash
cd be; Get-ChildItem -Path src -Recurse -File -Filter "*.ts" | Select-String -Pattern "clerk|Clerk" -CaseSensitive:$false | Group-Object Filename | ForEach-Object { "$($_.Name): $($_.Count)" }
```

Kỳ vọng chỉ còn `clerk-auth.guard.ts` (Task 11 sẽ xoá).

- [ ] **Step 6: Commit**

```bash
git add be/src/premium
git commit -m "refactor(premium): vai tro va han VIP luu trong DB thay cho Clerk metadata"
```

---

### Task 10: Quên mật khẩu và đặt lại mật khẩu

**Files:**
- Modify: `be/src/auth/auth.service.ts`
- Modify: `be/src/auth/auth.controller.ts`
- Test: `be/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `UserToken` với `type='reset_password'`, `hashToken`, `newToken`, `hashPassword`.
- Produces: `forgotPassword(email): Promise<{ message: string }>` — luôn trả cùng câu. `resetPassword(token, newPassword): Promise<boolean>`.

- [ ] **Step 1: Viết test đỏ**

```ts
describe('quên mật khẩu', () => {
  it('email không tồn tại vẫn trả cùng câu và không tạo token', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    const r = await svc.forgotPassword('khong@b.co');
    expect(r.message).toContain('đã gửi');
    expect(db.userToken.create).not.toHaveBeenCalled();
  });

  it('email có thật thì tạo token reset_password hạn 1 giờ và gửi mail', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
    await svc.register('a@b.co', 'matkhau123');
    await svc.forgotPassword('a@b.co');
    const row = db.state.userToken.find((t) => t.type === 'reset_password');
    expect(row).toBeTruthy();
    const ttl = row.expiresAt.getTime() - Date.now();
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000 + 5000);
    expect(sent).toHaveLength(1);
  });
});

describe('đặt lại mật khẩu', () => {
  it('mã hợp lệ thì đổi mật khẩu và xoá mọi phiên', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
    await svc.register('a@b.co', 'matkhau123');
    await db.user.update({ where: { id: db.state.user[0].id }, data: { emailVerifiedAt: new Date() } });
    await svc.login('a@b.co', 'matkhau123', 'UA');
    const link = String(sent.at(-1)!.text).match(/token=([0-9a-f]{64})/)![1];
    expect(await svc.resetPassword(link, 'matkhaumoi123')).toBe(true);
    expect(db.state.userToken.filter((t) => t.type === 'refresh')).toHaveLength(0);
  });

  it('mã dùng lần hai bị từ chối', async () => {
    const db = makeDb();
    const sent: any[] = [];
    const svc = new AuthService(db, { send: async (m: any) => { sent.push(m); } } as any);
    await svc.register('a@b.co', 'matkhau123');
    const link = String(sent.at(-1)!.text).match(/token=([0-9a-f]{64})/)![1];
    expect(await svc.resetPassword(link, 'matkhaumoi123')).toBe(true);
    expect(await svc.resetPassword(link, 'khac1234567')).toBe(false);
  });

  it('mật khẩu mới dưới 8 ký tự bị từ chối', async () => {
    const db = makeDb();
    const svc = new AuthService(db, { send: async () => {} } as any);
    await expect(svc.resetPassword('x'.repeat(64), 'ngan')).rejects.toMatchObject({ status: 400 });
  });
});
```

Test lấy mã từ nội dung mail là cách duy nhất không cần mock `newToken`. Nếu `register` không gửi mail vì `mail.send` bị nuốt lỗi, hãy dùng `vi.spyOn(tokens, 'newToken')` trả giá trị cố định 64 ký tự.

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd be; npx vitest run src/auth/auth.service.spec.ts
```

- [ ] **Step 3: Viết implementation**

```ts
const RESET_TTL_MS = 60 * 60 * 1000;

/** Luôn trả cùng một câu, dù email có tồn tại hay không. */
async forgotPassword(email: string): Promise<{ message: string }> {
  const mail = String(email ?? '').trim().toLowerCase();
  const reply = { message: 'Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.' };
  const user = await this.db.user.findUnique({ where: { email: mail } });
  if (!user || !user.emailVerifiedAt) return reply;

  const raw = newToken();
  await this.db.userToken.create({
    data: {
      userId: user.id, type: 'reset_password', tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  try {
    await this.mail.send({
      to: mail,
      subject: 'Đặt lại mật khẩu GoCode',
      text: `Chào bạn,\n\nLink này hết hạn sau 1 giờ:\n${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${raw}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.\n\nĐội ngũ GoCode`,
    });
  } catch {
    // im lặng có chủ đích
  }
  return reply;
}

async resetPassword(token: string, newPassword: string): Promise<boolean> {
  const pass = String(newPassword ?? '');
  if (pass.length < 8) throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự');
  const row = await this.db.userToken.findFirst({
    where: { tokenHash: hashToken(String(token ?? '')) },
  });
  if (!row || row.type !== 'reset_password' || row.usedAt) return false;
  if (Date.now() >= row.expiresAt.getTime()) return false;

  await this.db.user.update({
    where: { id: row.userId },
    data: { passwordHash: await hashPassword(pass) },
  });
  await this.db.userToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  // Bắt buộc: xoá mọi phiên, không chỉ phiên hiện tại.
  await this.logoutAll(row.userId);
  return true;
}
```

- [ ] **Step 4: Thêm route**

Trong `auth.controller.ts`:

```ts
@Post('forgot-password')
@HttpCode(200)
@UseGuards(ThrottleGuard)
@Throttle({ default: { limit: 3, ttl: 60 * 60 * 1000 } })
forgot(@Body() b: { email?: unknown }) {
  return this.auth.forgotPassword(String(b?.email ?? ''));
}

@Post('reset-password')
@HttpCode(200)
@UseGuards(ThrottleGuard)
async reset(@Body() b: { token?: unknown; password?: unknown }) {
  const ok = await this.auth.resetPassword(String(b?.token ?? ''), String(b?.password ?? ''));
  return ok
    ? { message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' }
    : { message: 'Mã đặt lại không hợp lệ hoặc đã hết hạn.' };
}
```

- [ ] **Step 5: Chạy test, lint, build**

```bash
cd be
npx vitest run src/auth
pnpm run lint
pnpm run build
```

- [ ] **Step 6: Commit**

```bash
git add be/src/auth
git commit -m "feat(auth): quen mat khau va dat lai mat khau, xoa moi phien"
```

---

### Task 11: Gỡ Clerk khỏi backend

**Files:**
- Delete: `be/src/auth/clerk-auth.guard.ts`
- Modify: `be/package.json` (bỏ `@clerk/backend`)
- Test: `be/test/api.e2e-spec.ts` (thêm assert 401)

**Interfaces:**
- Consumes: mọi task trước.
- Produces: BE không còn tham chiếu Clerk.

- [ ] **Step 1: Thêm test e2e chứng minh guard hoạt động**

Trong `be/test/api.e2e-spec.ts`:

```ts
it('route cần đăng nhập trả 401 khi không có cookie', async () => {
  await request(app.getHttpServer()).get('/api/progress/dashboard').expect(401);
});

it('cookie phiên giả không qua được AuthGuard', async () => {
  await request(app.getHttpServer())
    .get('/api/progress/dashboard')
    .set('Cookie', 'session=khong-phai-jwt; refresh=x')
    .expect(401);
});
```

- [ ] **Step 2: Xoá file và dependency**

```bash
cd be
Remove-Item src/auth/clerk-auth.guard.ts -Force
```

Trong `package.json`, xoá dòng `"@clerk/backend": "^2.33.7",`. Chạy `pnpm install`.

- [ ] **Step 3: Grep toàn repo**

```bash
cd E:\github\coding-dev-lab
Get-ChildItem -Path be -Recurse -File -Include "*.ts","*.json" | Where-Object { $_.FullName -notmatch "node_modules" } | Select-String -Pattern "clerk|Clerk" -CaseSensitive:$false
```

Kỳ vọng: không còn kết quả nào trong `be/` ngoài `pnpm-lock.yaml`.

- [ ] **Step 4: Chạy toàn bộ gate**

```bash
cd be
npx vitest run 2>&1 | Select-String "Tests |Test Files "
npx vitest run --config ./vitest.config.e2e.ts 2>&1 | Select-String "Tests |Test Files "
pnpm run lint
pnpm run build
```

- [ ] **Step 5: Commit**

```bash
git add be
git commit -m "chore(auth): go Clerk khoi backend"
```

Biến `CLERK_SECRET_KEY` và `CLERK_AUTHORIZED_PARTIES` **giữ lại trong file .env** cho tới khi deploy xong, xoá sau.

---

### Task 12: FE — `AuthProvider`, fetcher, bỏ `ClerkProvider`

**Files:**
- Create: `FE/app/ui/AuthProvider.tsx`
- Create: `FE/lib/api.ts`
- Modify: `FE/lib/swr.ts`
- Modify: `FE/app/layout.tsx`
- Delete hoặc rỗng: `FE/app/proxy.ts`
- Test: `FE/lib/api.test.ts`

**Interfaces:**
- Consumes: `/api/auth/me` (Task 7).
- Produces: `useSession(): { user: PublicUser | null; loading: boolean; refresh: () => Promise<void> }`, `authedFetcher(url, init?)` không còn tham số token, `publicUser()`.

- [ ] **Step 1: Viết test đỏ**

`FE/lib/api.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { authedFetcher } from './swr';

describe('authedFetcher', () => {
  it('gửi credentials include và không tự gắn Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ a: 1 }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await authedFetcher<{ a: number }>('http://x/api/me');
    expect(r).toEqual({ a: 1 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('include');
    expect(init.headers?.Authorization).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd FE; npx vitest run lib/api.test.ts
```

- [ ] **Step 3: Viết `authedFetcher` mới**

Trong `FE/lib/swr.ts`, thay `authedFetcher` cũ bằng:

```ts
export function authedFetcher<T = unknown>(url: string): Promise<T> {
  return fetch(url, { credentials: "include" }).then(async (res) => {
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json() as Promise<T>;
  });
}
```

- [ ] **Step 4: Viết `AuthProvider`**

`FE/app/ui/AuthProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API_URL } from "@/lib/swr";

export type PublicUser = { id: number; email: string; name: string | null; role: "user" | "vip" | "admin" };

type Session = { user: PublicUser | null; loading: boolean; refresh: () => Promise<void> };
const Ctx = createContext<Session>({ user: null, loading: true, refresh: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
      setUser(res.ok ? ((await res.json()) as { user: PublicUser }).user : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <Ctx.Provider value={{ user, loading, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
```

- [ ] **Step 5: Bọc `AuthProvider`, bỏ `ClerkProvider`**

Trong `FE/app/layout.tsx`: xoá import và `<ClerkProvider>` cùng các prop của nó, thay bằng `<AuthProvider>...</AuthProvider>` bao quanh `{children}`.

Trong `FE/app/proxy.ts`: xoá nội dung middleware của Clerk, để lại file rỗng hoặc xoá hẳn nếu không còn route nào dùng.

- [ ] **Step 6: Chạy test FE**

```bash
cd FE; npx vitest run 2>&1 | Select-String "Tests |Test Files "
```

Các test cũ gọi `authedFetcher(getToken)` sẽ đỏ — sửa bằng cách bỏ tham số.

- [ ] **Step 7: Commit**

```bash
git add FE
git commit -m "feat(auth): AuthProvider va fetcher dung cookie thay Clerk"
```

---

### Task 13: FE — form đăng nhập và đăng ký

Trước khi sửa bất kỳ tệp UI nào, đọc `craft-floor.md` của impeccable tại `https://raw.githubusercontent.com/pbakaus/impeccable/main/.agents/skills/impeccable/reference/craft-floor.md` và làm theo. `DESIGN.md` là nguồn chân lý: Inter, nền trắng, một accent emerald, bo góc đã ghim, chữ mono cho nhãn. Không đổi Inter.

**Files:**
- Create: `FE/app/ui/AuthForm.tsx`
- Modify: `FE/app/sign-in/[[...sign-in]]/page.tsx`
- Modify: `FE/app/sign-up/[[...sign-up]]/page.tsx`

**Interfaces:**
- Consumes: `API_URL`, `useSession`.
- Produces: `AuthForm({ mode: "signin" | "signup" })`, `setPassword`, `setSignUpDone`.

- [ ] **Step 1: Viết form**

`FE/app/ui/AuthForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/swr";
import { useSession } from "./AuthProvider";

const ERRORS: Record<string, string> = {
  "Mật khẩu phải có ít nhất 8 ký tự": "Mật khẩu phải có ít nhất 8 ký tự.",
  "Email không hợp lệ": "Email chưa đúng dạng.",
  "Email này đã được dùng để đăng ký": "Email này đã có tài khoản. Thử đăng nhập nhé.",
  "Email hoặc mật khẩu không đúng": "Email hoặc mật khẩu không đúng.",
};

export default function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(ERRORS[data?.message] ?? "Không đăng nhập được, thử lại sau."); return; }
      if (mode === "signup") { setSent(true); return; }
      await refresh();
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-600">// check your inbox</p>
        <h2 className="mt-2 text-xl font-bold text-zinc-950">Kiểm tra hộp thư</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Mình vừa gửi link xác nhận tới <span className="font-medium text-zinc-900">{email}</span>.
          Link hết hạn sau 24 giờ.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-zinc-800">Email</label>
        <input
          id="email" name="email" type="email" autoComplete="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-950 focus:border-zinc-400 focus:outline-none"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-zinc-800">Mật khẩu</label>
        <input
          id="password" name="password" type="password" required minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-950 focus:border-zinc-400 focus:outline-none"
        />
        {mode === "signup" && <p className="text-xs text-zinc-500">Ít nhất 8 ký tự.</p>}
      </div>

      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit" disabled={busy}
        className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {busy ? "Đang xử lý…" : mode === "signup" ? "Tạo tài khoản" : "Đăng nhập"}
      </button>

      {mode === "signup" ? (
        <p className="text-center text-xs text-zinc-500">
          Đã có tài khoản?{" "}
          <Link href="/sign-in" className="font-medium text-zinc-900 underline underline-offset-4">Đăng nhập</Link>
        </p>
      ) : (
        <p className="text-center text-xs text-zinc-500">
          <Link href="/forgot-password" className="font-medium text-zinc-900 underline underline-offset-4">Quên mật khẩu?</Link>
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Nối vào hai trang**

`sign-in/[[...sign-in]]/page.tsx`: thay `<SignIn />` bằng `<AuthForm mode="signin" />`, giữ nguyên `AuthShell` và `metadata`.

`sign-up/[[...sign-up]]/page.tsx`: thay `<SignUp />` bằng `<AuthForm mode="signup" />`, giữ nguyên `AuthShell` và `metadata`.

- [ ] **Step 3: Kiểm tra thủ công**

Chạy `pnpm dev` từ thư mục gốc, mở `/sign-in` và `/sign-up`. Xác nhận: nhãn gắn đúng `htmlFor`, bấm Enter gửi form, thông báo lỗi hiện đúng tiếng Việt, nút khi đang bật bị disable, và sau khi đăng nhập thì `useSession().user` có giá trị.

- [ ] **Step 4: Commit**

```bash
git add FE
git commit -m "feat(auth): form dang nhap va dang ky thay Clerk"
```

---

### Task 14: FE — quên mật khẩu, đặt lại mật khẩu, thay `useUser()` còn lại, gỡ `@clerk/nextjs`

**Files:**
- Create: `FE/app/forgot-password/page.tsx`
- Create: `FE/app/reset-password/page.tsx`
- Modify: `FE/app/ui/Navbar.tsx`, `FE/app/ui/PremiumGuard.tsx`, `FE/app/ui/ViewTracker.tsx`, `FE/app/page.tsx`, `FE/app/hooks/useDashboard.ts`
- Modify: `FE/package.json`

**Interfaces:**
- Consumes: `useSession`, `/api/auth/forgot-password`, `/api/auth/reset-password`.
- Produces: không có interface mới; các chỗ dùng `useUser()` chuyển sang `useSession().user`.

- [ ] **Step 1: Trang `/forgot-password`**

```tsx
"use client";

import { useState } from "react";
import AuthShell from "@/app/ui/AuthShell";
import { API_URL } from "@/lib/swr";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(data?.message ?? "Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell kicker="// reset access" title="Lấy lại quyền truy cập.">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-zinc-800">Email đã đăng ký</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-zinc-400 focus:outline-none" />
        </div>
        {message && <p role="status" className="text-sm text-zinc-700">{message}</p>}
        <button type="submit" disabled={busy}
          className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60">
          {busy ? "Đang gửi…" : "Gửi link đặt lại"}
        </button>
      </form>
    </AuthShell>
  );
}
```

- [ ] **Step 2: Trang `/reset-password`**

`useSearchParams` bắt buộc phải nằm trong `<Suspense>` ở App Router, nên tách phần đọc query ra một component con.

`FE/app/reset-password/ResetForm.tsx`:

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthShell from "@/app/ui/AuthShell";
import { API_URL } from "@/lib/swr";

function Form() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      setDone(true);
      if (!res.ok) return;
      setTimeout(() => router.push("/sign-in"), 1500);
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
        <p role="alert" className="text-sm text-zinc-700">Link này thiếu mã. Hãy mở lại link trong email.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6">
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-600">// done</p>
        <h2 className="mt-2 text-xl font-bold text-zinc-950">Đã đổi mật khẩu</h2>
        <p className="mt-2 text-sm text-zinc-600">Đang đưa bạn sang trang đăng nhập…</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="block text-sm font-medium text-zinc-800">Mật khẩu mới</label>
        <input id="new-password" type="password" required minLength={8} autoComplete="new-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-zinc-400 focus:outline-none" />
        <p className="text-xs text-zinc-500">Ít nhất 8 ký tự. Đổi xong bạn sẽ bị đăng xuất khỏi mọi thiết bị.</p>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60">
        {busy ? "Đang lưu…" : "Đổi mật khẩu"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell kicker="// new password" title="Đặt mật khẩu mới.">
      <Suspense fallback={<p className="text-sm text-zinc-500">Đang tải…</p>}>
        <Form />
      </Suspense>
    </AuthShell>
  );
}
```

Tạo `FE/app/reset-password/page.tsx` chỉ để `export { default } from "./ResetForm";`.

- [ ] **Step 3: Thay `useUser()` ở các file còn lại**

Với mỗi file trong `Navbar.tsx`, `PremiumGuard.tsx`, `ViewTracker.tsx`, `page.tsx`, `useDashboard.ts`: bỏ import từ `@clerk/nextjs`, thay `useUser()` bằng `useSession()` và `user` thành `session.user`. Ở `ViewTracker.tsx:45` chỗ gửi `clerkId` đổi thành `userId: session.user?.id ?? null`.

Với `authedFetcher(getToken)` — bỏ tham số.

- [ ] **Step 4: Gỡ dependency**

Trong `FE/package.json` xoá `"@clerk/nextjs"`, chạy `pnpm install`.

- [ ] **Step 5: Grep xem còn sót Clerk ở FE không**

```bash
cd E:\github\coding-dev-lab
Get-ChildItem -Path FE,admin -Recurse -File -Include "*.ts","*.tsx" | Where-Object { $_.FullName -notmatch "node_modules|\.next" } | Select-String -Pattern "clerk" -CaseSensitive:$false
```

Kỳ vọng: không còn kết quả nào.

- [ ] **Step 6: Chạy test FE**

```bash
cd FE; npx vitest run 2>&1 | Select-String "Tests |Test Files "
```

- [ ] **Step 7: Commit**

```bash
git add FE
git commit -m "feat(auth): trang quen mat khau, dat lai mat khau, go @clerk/nextjs"
```

---

### Task 15: Bảng user trong admin — bỏ dữ liệu Clerk

Admin **không** dùng Clerk để đăng nhập (`AdminGuard` dùng RS256 cookie sẵn có), nhưng trang danh sách user lại đọc dữ liệu từ Clerk.

**Files:**
- Modify: `be/src/admin/admin.service.ts` (bỏ `createClerkClient` ở phần enrich user)
- Modify: `admin/app/(dashboard)/page.tsx:12-25,120,125,55`
- Test: `be/src/admin/admin.service.spec.ts`

**Interfaces:**
- Consumes: bảng `User` cục bộ (`email`, `name`, `role`, `createdAt`).
- Produces: endpoint danh sách user trả `{ id: number; email: string; name: string | null; role: string; createdAt: string }[]` thay vì `{ clerkId, user: ClerkUser }`.

- [ ] **Step 1: Viết test đỏ**

Thêm vào `admin.service.spec.ts`:

```ts
describe('danh sách user lấy từ bảng User cục bộ', () => {
  it('không gọi Clerk nữa và trả về userId số', async () => {
    const db = {
      user: { findMany: vi.fn().mockResolvedValue([
        { id: 1, email: 'a@b.co', name: 'An', role: 'vip', createdAt: new Date('2026-01-01') },
      ]), count: vi.fn().mockResolvedValue(1) },
    };
    const svc = new AdminService(db as any);
    const r = await svc.listUsers();
    expect(r.users[0]).toMatchObject({ id: 1, email: 'a@b.co', name: 'An', role: 'vip' });
    expect(r.totalCount).toBe(1);
  });
});
```

Đọc `be/src/admin/admin.service.ts` phần constructor để gọi đúng số tham số.

- [ ] **Step 2: Chạy để thấy đỏ**

```bash
cd be; npx vitest run src/admin/admin.service.spec.ts
```

- [ ] **Step 3: Bỏ phần enrich từ Clerk**

Trong `admin.service.ts`, hàm danh sách user hiện gọi `createClerkClient` để lấy `imageUrl` và `email` rồi ghép vào kết quả. Bỏ hẳn phần đó, đọc thẳng `db.user.findMany({ orderBy: { createdAt: 'desc' } })` và `db.user.count()`. Xoá import `createClerkClient` nếu không còn chỗ nào dùng.

Cũng kiểm tra `getLoginAnalytics` (`admin.service.ts:270-288`) — nó cũng gọi `clerk.users.getUserList` để lấy tên. Thay bằng `db.user.findMany({ where: { id: { in: ids } }, select: { id, name, email } })` và hiển thị `name ?? email`.

- [ ] **Step 4: Sửa admin FE**

Trong `admin/app/(dashboard)/page.tsx`: bỏ kiểu `ClerkUser`, đổi `clerkId: string` thành `id: number`, và ở dòng 120-125 dùng `s.email` / `s.name` thay cho `s.user?.imageUrl` / `s.user?.email`. Sửa dòng 55: bỏ chữ "từ Clerk".

Do mất avatar, dùng Dicebear theo email như hiện tại: `` `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(s.email)}` ``.

- [ ] **Step 5: Chạy test và lint**

```bash
cd be
npx vitest run src/admin 2>&1 | Select-String "Tests |Test Files "
pnpm run lint
cd ..\admin; pnpm run lint
```

- [ ] **Step 6: Commit**

```bash
git add be/src/admin admin/app
git commit -m "refactor(admin): danh sach user doc tu bang User, bo du lieu Clerk"
```

---

### Task 16: Xác minh cuối

**Files:** không tạo file mới.

- [ ] **Step 1: Chạy toàn bộ gate của cả ba app**

```bash
cd E:\github\coding-dev-lab\be
npx vitest run 2>&1 | Select-String "Tests |Test Files "
npx vitest run --config ./vitest.config.e2e.ts 2>&1 | Select-String "Tests |Test Files "
pnpm run lint
pnpm run build
cd ..\FE
npx vitest run 2>&1 | Select-String "Tests |Test Files "
pnpm run lint
cd ..\admin
pnpm run lint
```

Tất cả phải xanh, 0 lỗi lint.

- [ ] **Step 2: Grep toàn repo lần cuối**

```bash
cd E:\github\coding-dev-lab
Get-ChildItem -Recurse -File -Include "*.ts","*.tsx","*.json" | Where-Object { $_.FullName -notmatch "node_modules|\.next|pnpm-lock" } | Select-String -Pattern "clerk" -CaseSensitive:$false
```

Kỳ vọng: không có kết quả nào.

- [ ] **Step 3: Chạy app và kiểm tra tay luồng thật**

```bash
cd E:\github\coding-dev-lab; pnpm dev
```

Đi qua hết một vòng: đăng ký → nhận mail → xác minh → vào app → giải một bài → đóng trình duyệt → mở lại, vẫn còn phiên → đăng nhập ở cửa sổ khác, phiên cũ **vẫn còn** → `/forgot-password` → đặt lại mật khẩu → xác nhận cả hai cửa sổ đều bị đuổi.

- [ ] **Step 4: Dọn biến môi trường**

Xoá `CLERK_SECRET_KEY` và `CLERK_AUTHORIZED_PARTIES` khỏi `.env` và biến môi trường production. Không commit `.env`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(auth): go Clerk, don dep va bien moi truong"
```

---

## Ghi chú cho người thực thi

- **Task 1 là task duy nhất phá huỷ dữ liệu.** Chạy `backup-db.ts`, xác nhận file backup không rỗng, rồi mới chạy `migrate-auth.ts`. Nếu file backup rỗng thì dừng.
- **Task 3 đụng rộng nhất.** Đổi `clerkId: string` → `userId: number` trên 7 service. Chạy test từng file sau khi sửa từng file, đừng sửa hết rồi mới chạy.
- **Task 8 bắt buộc phải giữ nguyên hành vi bảo mật.** Sau khi đổi guard, hãy chạy lại các test 401 trong `api.e2e-spec.ts` trước khi sang task sau.
- **Nếu một task vượt quá phạm vi mô tả**, đừng tự mở rộng. Ghi lại phần chưa làm vào commit message rồi hỏi.
