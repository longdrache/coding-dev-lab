# Google OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đăng nhập bằng Google, chạy hoàn toàn trong BE, dùng lại đúng cookie phiên RS256 sẵn có.

**Architecture:** BE sinh `state` (RS256 ký, TTL 10 phút) + PKCE `code_verifier`, lưu vào bảng `UserOAuthState` (state lưu dạng hash). Redirect tới Google, callback đổi `code` lấy profile, chọn nhánh tài khoản, ghi `UserAccount`, rồi gọi `setSessionCookies` — cùng đường với login hiện tại. FE chỉ render nút.

**Tech Stack:** NestJS 12, Prisma 7, `google-auth-library`, Vitest, `node:crypto`.

**Spec:** `docs/superpowers/specs/2026-09-28-google-oauth-design.md`

## Global Constraints

- Chỉ provider `google`. Không GitHub. Không Passport. Không Auth.js.
- Khớp tài khoản **luôn theo `providerUserId` (`sub`)**, không theo email.
- Chỉ tin `email_verified === true`; ngược lại từ chối và không ghi gì.
- `state` lưu dạng sha256, TTL 10 phút, dùng một lần rồi xoá.
- `redirectTo` chỉ nhận đường dẫn nội bộ: bắt đầu `/`, không `//`, không `/\`. Kiểm ở **cả hai** đầu: FE (`safeRedirect`) và BE.
- Không phát sinh hệ phiên thứ hai: callback phải gọi `setSessionCookies` với token RS256 như `login` hiện tại.
- `User.passwordHash` đã là `String?` — user chỉ dùng Google có `null`, không cần đổi schema cột này.
- Copy tiếng Việt, không dịch Anh.
- Mọi test bảo mật phải **mutation-detectable**: sửa dòng code mà test nhắm tới thì test phải đỏ.
- Không commit file sửa sẵn của người dùng (`be/src/admin/dto/create-problem.dto.ts`, `re.md`).

---

### Task 1: Bảng `UserAccount` + `UserOAuthState`

**Files:**
- Modify: `be/prisma/schema.prisma` (thêm 2 model, thêm quan hệ vào `User`)
- Create: `be/prisma/migrations/20260928120000_google_oauth/migration.sql` (sinh bằng lệnh ở Step 4)
- Test: `be/test/api.e2e-spec.ts` (mở rộng để assert bảng tồn tại)

**Interfaces:**
- Produces: `UserAccount { id, userId, provider, providerUserId, createdAt }` với unique `(provider, providerUserId)`
- Produces: `UserOAuthState { stateHash, codeVerifier, redirectTo, expiresAt, usedAt }`
- Produces: `db.userAccount`, `db.userOAuthState` (qua `DatabaseService`)

- [ ] **Step 1: Thêm model vào schema.prisma**

Thêm ngay sau khai báo `model UserToken { ... }`:

```prisma
model UserAccount {
  id             Int      @id @default(autoincrement())
  userId         Int
  provider       String
  providerUserId String
  createdAt      DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerUserId])
  @@index([userId])
}

model UserOAuthState {
  stateHash    String   @id
  codeVerifier String
  redirectTo   String
  expiresAt    DateTime
  usedAt       DateTime?
}
```

Và trong `model User`, thêm vào khối quan hệ đang có (cạnh `tokens UserToken[]`):

```prisma
  accounts    UserAccount[]
```

- [ ] **Step 2: Sinh client Prisma**

Run: `cd be && pnpm prisma:generate`
Expected: exit 0, `be/src/generated/prisma/client.ts` được cập nhật.

- [ ] **Step 3: Áp dụng schema lên database**

Lịch sử migration đã được gộp còn 1 migration nền, nên dùng `migrate dev` để sinh
migration mới đúng thứ tự:

Run: `cd be && pnpm prisma migrate dev --name google_oauth`
Expected: Prisma hỏi xác nhận — trả lời `y`. Sinh
`be/prisma/migrations/20260928120000_google_oauth/migration.sql` chứa `CREATE TABLE`
cho 2 bảng + FK + unique index.

Nếu Prisma 7 chặn thao tác xoá dữ liệu với agent AI, đặt
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` bằng đúng nội dung người dùng đã đồng ý
rồi chạy lại.

- [ ] **Step 4: Xác minh schema đúng**

Run: `cd be && pnpm prisma migrate status`
Expected: `Database schema is up to date!`

Run: `cd be && pnpm exec vitest run --config ./vitest.config.e2e.ts`
Expected: 73 passed (chưa đụng gì logic).

- [ ] **Step 5: Commit**

```bash
git add be/prisma/schema.prisma be/prisma/migrations be/src/generated
git commit -m "feat(auth): bang UserAccount va UserOAuthState cho Google OAuth"
```

---

### Task 2: `oauth-state.ts` — sinh và kiểm `state`

**Files:**
- Create: `be/src/auth/oauth-state.ts`
- Test: `be/src/auth/oauth-state.spec.ts`

**Interfaces:**
- Consumes: `newToken()`, `hashToken()` từ `./tokens.ts`
- Produces:
  - `createState(redirectTo: string): Promise<{ state: string; codeVerifier: string }>`
  - `consumeState(state: string): Promise<{ codeVerifier: string; redirectTo: string } | null>`
  - `safeInternalPath(raw: string): string` — luôn trả đường dẫn nội bộ, fallback `'/'`

- [ ] **Step 1: Viết test đỏ**

Tạo `be/src/auth/oauth-state.spec.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState, consumeState, safeInternalPath } from './oauth-state.ts';

function makeDb() {
  const state: Record<string, any> = { oauth: [] };
  return {
    state,
    userOAuthState: {
      create: vi.fn(async ({ data }: any) => {
        state.oauth.push(data);
        return data;
      }),
      findUnique: vi.fn(async ({ where }: any) =>
        state.oauth.find((r) => r.stateHash === where.stateHash) ?? null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const r = state.oauth.find((x) => x.stateHash === where.stateHash)!;
        Object.assign(r, data);
        return r;
      }),
    },
  } as any;
}

describe('safeInternalPath', () => {
  it('nhận đường dẫn nội bộ', () => {
    expect(safeInternalPath('/problem/two-sum')).toBe('/problem/two-sum');
    expect(safeInternalPath('  /premium  ')).toBe('/premium');
  });

  it('từ chối URL ngoài, protocol-relative và scheme lạ', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/');
    expect(safeInternalPath('//evil.com')).toBe('/');
    expect(safeInternalPath('/\\evil.com')).toBe('/');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
  });

  it('rỗng thì về trang chủ', () => {
    expect(safeInternalPath('')).toBe('/');
    expect(safeInternalPath(undefined as any)).toBe('/');
  });
});

describe('createState / consumeState', () => {
  it('state trả về dùng được một lần rồi chết', async () => {
    const db = makeDb();
    const { state } = await createState(db, '/problem');
    const first = await consumeState(db, state);
    expect(first).toEqual({ codeVerifier: expect.any(String), redirectTo: '/problem' });
    const second = await consumeState(db, state);
    expect(second).toBeNull();
  });

  it('lưu state dạng hash, không lưu bản rõ', async () => {
    const db = makeDb();
    const { state } = await createState(db, '/');
    const row = db.state.oauth[0];
    expect(row.stateHash).not.toBe(state);
    expect(row.stateHash).toHaveLength(64);
  });

  it('state hết hạn thì trả null, không ném', async () => {
    const db = makeDb();
    const { state } = await createState(db, '/', new Date(Date.now() - 1000));
    expect(await consumeState(db, state)).toBeNull();
  });

  it('state không tồn tại thì trả null', async () => {
    const db = makeDb();
    expect(await consumeState(db, 'khong-ton-tai')).toBeNull();
  });
});

afterEach(() => vi.useRealTimers());
```

- [ ] **Step 2: Chạy test, phải đỏ**

Run: `cd be && pnpm exec vitest run src/auth/oauth-state.spec.ts`
Expected: FAIL với `Cannot find module './oauth-state.ts'`

- [ ] **Step 3: Viết implementation**

Tạo `be/src/auth/oauth-state.ts`:

```ts
import { createHash } from 'node:crypto';
import { newToken } from './tokens.ts';

const STATE_TTL_MS = 10 * 60 * 1000;
const PROVIDER_SCOPES = ['openid', 'email', 'profile'] as const;

type DbLike = {
  userOAuthState: {
    create(a: any): Promise<any>;
    findUnique(a: any): Promise<any>;
    update(a: any): Promise<any>;
  };
};

/**
 * Chỉ nhận đường dẫn nội bộ. `redirect_uri` về phía FE là dữ liệu do trình
 * duyệt gửi lên, không kiểm thì biến thành open redirect: kẻ xấu gửi
 * `/start?redirect_to=https://site-gia-mao.com` để đưa người dùng vừa đăng
 * nhập xong sang trang giả mạo.
 */
export function safeInternalPath(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  const v = raw.trim();
  if (!v.startsWith('/')) return '/';
  if (v.startsWith('//') || v.startsWith('/\\')) return '/';
  return v;
}

const hashState = (state: string) => createHash('sha256').update(state).digest('hex');

export async function createState(
  db: DbLike,
  redirectTo: string,
  now: Date = new Date(),
): Promise<{ state: string; codeVerifier: string }> {
  const state = newToken();
  const codeVerifier = newToken();
  await db.userOAuthState.create({
    data: {
      stateHash: hashState(state),
      codeVerifier,
      redirectTo: safeInternalPath(redirectTo),
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    },
  });
  return { state, codeVerifier };
}

export async function consumeState(
  db: DbLike,
  state: string,
  now: Date = new Date(),
): Promise<{ codeVerifier: string; redirectTo: string } | null> {
  if (!state) return null;
  const row = await db.userOAuthState.findUnique({ where: { stateHash: hashState(state) } });
  if (!row || row.usedAt) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  // Đánh dấu đã dùng TRƯỚC khi trả về: state dùng một lần, kể cả khi hai
  // callback tới cùng lúc.
  await db.userOAuthState.update({ where: { stateHash: row.stateHash }, data: { usedAt: now } });
  return { codeVerifier: row.codeVerifier, redirectTo: safeInternalPath(row.redirectTo) };
}

export const GOOGLE_SCOPES = [...PROVIDER_SCOPES];
export const GOOGLE_PROVIDER = 'google';
```

- [ ] **Step 4: Chạy test, phải xanh**

Run: `cd be && pnpm exec vitest run src/auth/oauth-state.spec.ts`
Expected: PASS 8/8

- [ ] **Step 5: Mutation test — bỏ kiểm nội bộ**

Sửa `safeInternalPath` thành `return String(raw ?? '/')`, chạy lại test.
Expected: FAIL (test `từ chối URL ngoài` đỏ). Hoàn nguyên.

- [ ] **Step 6: Commit**

```bash
git add be/src/auth/oauth-state.ts be/src/auth/oauth-state.spec.ts
git commit -m "feat(auth): sinh va mot lan dung state cho OAuth, chi nhan duong dan noi bo"
```

---

### Task 3: `AuthService` — bốn nhánh tài khoản

**Files:**
- Modify: `be/src/auth/auth.service.ts` (thêm import + 2 method mới, đặt trước dấu `}` cuối class)
- Test: `be/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `safeInternalPath`, `GOOGLE_PROVIDER` từ `./oauth-state.ts`; `hashPassword` từ `./tokens.ts`
- Produces: `googleProfile()` → `{ sub, email, emailVerified, name } | null`
- Produces: `linkOrCreateFromGoogle(p: GoogleProfile, signedInUserId: number | null): Promise<LinkResult>`
  - `LinkResult = { kind: 'ok'; userId: number } | { kind: 'needs-password'; email: string } | { kind: 'unverified' } | { kind: 'conflict' }`

- [ ] **Step 1: Viết test đỏ**

Thêm vào cuối `be/src/auth/auth.service.spec.ts`. Dùng lại `makeDb()` đã có sẵn trong
file, và tạo thêm `userAccount` vào db của `makeDb` nếu chưa có:

```ts
const GOOGLE_OK = { sub: 'g-1', email: 'a@b.co', emailVerified: true, name: 'A B' };

describe('linkOrCreateFromGoogle', () => {
  it('email mới thì tạo user đã xác minh và ghi UserAccount', async () => {
    const { db, svc } = await seedVerified();
    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    expect(r).toEqual({ kind: 'ok', userId: 1 });
    expect(db.state.user[0].emailVerifiedAt).toBeTruthy();
    expect(db.state.userAccount[0]).toMatchObject({ provider: 'google', providerUserId: 'g-1' });
  });

  it('email_verified false thì từ chối, không ghi gì', async () => {
    const { db, svc } = await seedVerified();
    const r = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, emailVerified: false }, null);
    expect(r).toEqual({ kind: 'unverified' });
    expect(db.state.userAccount).toHaveLength(0);
  });

  it('email đã có và đang đăng nhập thì ghép vào user đó', async () => {
    const { db, svc } = await seedVerified();
    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, 1);
    expect(r).toEqual({ kind: 'ok', userId: 1 });
    expect(db.state.user).toHaveLength(1);
  });

  it('email đã có mà CHƯA đăng nhập thì không ghép — ranh giới bảo mật', async () => {
    const { db, svc } = await seedVerified();
    const r = await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    expect(r).toEqual({ kind: 'ok', userId: 1 }); // lần đầu chưa có user nào
    // user lần 2 tới mà không đăng nhập: email đã tồn tại
    const r2 = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, sub: 'g-2' }, null);
    expect(r2).toEqual({ kind: 'needs-password', email: 'a@b.co' });
    expect(db.state.user).toHaveLength(1);
  });

  it('khớp theo sub chứ không theo email: sub đã gắn user khác thì báo conflict', async () => {
    const { db, svc } = await seedVerified();
    await svc.linkOrCreateFromGoogle(GOOGLE_OK, null);
    const r = await svc.linkOrCreateFromGoogle({ ...GOOGLE_OK, email: 'khac@b.co' }, null);
    expect(r).toEqual({ kind: 'conflict' });
  });
});
```

- [ ] **Step 2: Chạy test, phải đỏ**

Run: `cd be && pnpm exec vitest run src/auth/auth.service.spec.ts -t "linkOrCreateFromGoogle"`
Expected: FAIL với `linkOrCreateFromGoogle is not a function`

- [ ] **Step 3: Thêm `userAccount` vào mock db trong spec**

Trong `makeDb()` của `auth.service.spec.ts`, thêm vào `state` và vào object trả về:

```ts
  const state: Record<string, any[]> = { user: [], userToken: [], userAccount: [] };
```

```ts
    userAccount: {
      findUnique: vi.fn(async ({ where }: any) =>
        state.userAccount.find((a) => a.provider === where.provider && a.providerUserId === where.providerUserId) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        state.userAccount.push(data);
        return data;
      }),
    },
```

- [ ] **Step 4: Viết implementation**

Thêm vào đầu `auth.service.ts`, cạnh các import hiện có:

```ts
import { GOOGLE_PROVIDER, safeInternalPath } from './oauth-state.ts';

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export type LinkResult =
  | { kind: 'ok'; userId: number }
  | { kind: 'needs-password'; email: string }
  | { kind: 'unverified' }
  | { kind: 'conflict' };
```

Thêm hai method trước dấu `}` cuối cùng của `export class AuthService`:

```ts
  /**
   * Lấy profile từ Google bằng authorization code.
   *
   * Trả `null` khi thiếu cấu hình — nút Google lúc đó chỉ nên báo lỗi tạm, không
   * nên ném lỗi 500 làm người dùng tưởng tài khoản sai.
   */
  async googleProfile(code: string, codeVerifier: string): Promise<GoogleProfile | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.warn('Chưa cấu hình GOOGLE_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI — bỏ qua OAuth');
      return null;
    }
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    if (!res.ok) {
      this.logger.warn(`Google trả ${res.status} khi đổi code`);
      return null;
    }
    const tok = (await res.json()) as { access_token?: string };
    if (!tok.access_token) return null;

    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!info.ok) {
      this.logger.warn(`Google trả ${info.status} khi lấy userinfo`);
      return null;
    }
    const raw = (await info.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    if (!raw.sub || !raw.email) return null;
    return {
      sub: raw.sub,
      email: raw.email,
      emailVerified: raw.email_verified === true,
      name: raw.name ?? null,
    };
  }

  /**
   * Bốn nhánh xử lý tài khoản sau khi có profile Google.
   *
   * Nhánh `needs-password` là **ranh giới bảo mật**: nếu tự ghép theo email thì
   * kẻ nào đăng ký Google với email của bạn cũng vào được tài khoản bạn. Nên khi
   * email đã tồn tại mà người dùng chưa đăng nhập, ta bắt họ đăng nhập bằng
   * mật khẩu trước — bấm lại nút Google lúc đó sẽ rơi vào nhánh `ok`.
   *
   * Khớp theo `sub`, không theo email: `sub` ổn định, email thì Google cho đổi.
   */
  async linkOrCreateFromGoogle(
    p: GoogleProfile,
    signedInUserId: number | null,
  ): Promise<LinkResult> {
    if (!p.emailVerified) return { kind: 'unverified' };

    const existingLink = await this.db.userAccount.findUnique({
      where: { provider_providerUserId: { provider: GOOGLE_PROVIDER, providerUserId: p.sub } },
    });
    if (existingLink) {
      if (signedInUserId !== null && existingLink.userId !== signedInUserId) return { kind: 'conflict' };
      return { kind: 'ok', userId: existingLink.userId };
    }

    const byEmail = await this.db.user.findUnique({ where: { email: p.email } });
    if (byEmail) {
      if (signedInUserId === null) return { kind: 'needs-password', email: p.email };
      if (byEmail.id !== signedInUserId) return { kind: 'conflict' };
      await this.db.userAccount.create({
        data: { userId: byEmail.id, provider: GOOGLE_PROVIDER, providerUserId: p.sub },
      });
      return { kind: 'ok', userId: byEmail.id };
    }

    const created = await this.db.user.create({
      data: {
        email: p.email,
        name: p.name,
        emailVerifiedAt: new Date(),
        // Không có mật khẩu: user chỉ dùng Google. `passwordHash` đã nullable.
        role: 'user',
      },
    });
    await this.db.userAccount.create({
      data: { userId: created.id, provider: GOOGLE_PROVIDER, providerUserId: p.sub },
    });
    return { kind: 'ok', userId: created.id };
  }
```

Bỏ import `safeInternalPath` nếu không dùng trong file này (controller mới dùng).

- [ ] **Step 5: Chạy test, phải xanh**

Run: `cd be && pnpm exec vitest run src/auth/auth.service.spec.ts`
Expected: PASS toàn bộ (98 test cũ + 5 mới)

- [ ] **Step 6: Mutation test — bỏ nhánh bảo mật**

Sửa `if (signedInUserId === null) return { kind: 'needs-password', email: p.email };` thành
`if (false) return { kind: 'needs-password', email: p.email };`, chạy lại.
Expected: FAIL (test `email đã có mà CHƯA đăng nhập` đỏ). Hoàn nguyên.

- [ ] **Step 7: Commit**

```bash
git add be/src/auth/auth.service.ts be/src/auth/auth.service.spec.ts
git commit -m "feat(auth): bon nhanh lien ket tai khoan tu profile Google, khop theo sub"
```

---

### Task 4: Route `start` + `callback`

**Files:**
- Modify: `be/src/auth/auth.controller.ts`
- Test: `be/test/api.e2e-spec.ts` (thêm 2 route vào mảng route bảo vệ **không** — cần nói rõ)

**Interfaces:**
- Consumes: `createState`, `consumeState`, `safeInternalPath`, `GOOGLE_SCOPES`, `GOOGLE_PROVIDER` từ `./oauth-state.ts`; `auth.linkOrCreateFromGoogle`, `auth.googleProfile`; `setSessionCookies` (đã có trong file)
- Produces: `GET /api/auth/oauth/google/start`, `GET /api/auth/oauth/google/callback`

- [ ] **Step 1: Thêm route vào controller**

Thêm trước `@Get('me')`:

```ts
  @Get('oauth/google/start')
  async googleStart(
    @Query('redirect_to') redirectTo: string | undefined,
    @Res() res: CookieResponse,
  ) {
    const safe = safeInternalPath(redirectTo);
    const { state, codeVerifier } = await this.auth.beginGoogleOAuth(safe);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', process.env.GOOGLE_REDIRECT_URI ?? '');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    // KHÔNG dùng prompt=select_account: nó ép hiện danh sách tài khoản mỗi
    // lần bấm, đúng thứ không cần ở nút "Đăng nhập bằng Google".
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', await pkceChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    res.redirect(302, url.toString());
    return undefined;
  }

  @Get('oauth/google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') err: string | undefined,
    @Res() res: CookieResponse,
  ) {
    if (err || !code) return res.redirect(302, '/sign-in?oauth=cancelled');
    const consumed = await this.auth.takeGoogleState(state ?? '');
    if (!consumed) return res.redirect(302, '/sign-in?oauth=expired');
    const profile = await this.auth.googleProfile(code, consumed.codeVerifier);
    if (!profile) return res.redirect(302, '/sign-in?oauth=failed');
    const signedIn = await this.auth.currentUserId(res);
    const r = await this.auth.linkOrCreateFromGoogle(profile, signedIn);
    if (r.kind === 'ok') {
      const tokens = await this.auth.issueSession(r.userId);
      setSessionCookies(res, tokens);
      return res.redirect(302, safeInternalPath(consumed.redirectTo));
    }
    if (r.kind === 'needs-password') {
      return res.redirect(302, `/sign-in?oauth=exists&email=${encodeURIComponent(r.email)}`);
    }
    return res.redirect(302, '/sign-in?oauth=unverified');
  }
```

Cần thêm import ở đầu controller: `createHash`, `pkceChallenge` từ `node:crypto`;
`createState`, `consumeState`, `safeInternalPath`, `GOOGLE_SCOPES` từ `./oauth-state.ts`.

Thêm helper ở cấp module, cạnh `setSessionCookies`:

```ts
/** PKCE S256: base64url(sha256(verifier)). */
function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
```

Và thêm ba method vào `AuthService`:

```ts
  async beginGoogleOAuth(redirectTo: string): Promise<{ state: string; codeVerifier: string }> {
    return createState(this.db, redirectTo);
  }

  async takeGoogleState(state: string): Promise<{ codeVerifier: string; redirectTo: string } | null> {
    return consumeState(this.db, state);
  }

  async issueSession(userId: number): Promise<{ accessToken: string; refreshToken: string }> {
    const tokens = await this.issueRefresh(userId, 'oauth');
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }
```

Nếu `issueRefresh` hiện chưa trả `accessToken`, dùng lại đúng cách `login()` đang làm và
đặt tên là `issueSession` để chỉ có một nơi phát phiên.

- [ ] **Step 2: Thêm route mới vào e2e — kiểm chúng CHẮC chắn không yêu cầu phiên**

Trong `be/test/api.e2e-spec.ts`, thêm test:

```ts
it('route Google start và callback không yêu cầu phiên', async () => {
  // start phải 302 tới accounts.google.com, không phải 401
  const s = await request(app.getHttpServer()).get('/api/auth/oauth/google/start');
  expect(s.status).toBe(302);
  expect(s.headers.location).toContain('accounts.google.com');

  // callback không có code phải chuyển hướng, không 500
  const c = await request(app.getHttpServer()).get('/api/auth/oauth/google/callback');
  expect(c.status).toBe(302);
  expect(c.headers.location).toBe('/sign-in?oauth=cancelled');
});

it('start với redirect_to ngoài nội bộ thì bỏ qua', async () => {
  const s = await request(app.getHttpServer())
    .get('/api/auth/oauth/google/start?redirect_to=https://evil.com');
  expect(s.status).toBe(302);
  // state lưu trong DB phải là '/'
  const st = await db.userOAuthState.findMany();
  expect(st[0].redirectTo).toBe('/');
});
```

- [ ] **Step 3: Chạy e2e**

Run: `cd be && E2E_ALLOW_PROD=1 pnpm test:e2e`
Expected: 75 passed (73 cũ + 2 mới)

> Ghi chú cho người chạy: `E2E_ALLOW_PROD=1` chỉ cần khi `DATABASE_URL` trỏ Neon
> thật. Nếu chạy trên Postgres thật thì không cần.

- [ ] **Step 4: `tsc` + lint + build**

Run: `cd be && pnpm exec tsc --noEmit && pnpm run lint && pnpm run build`
Expected: 0 lỗi, build xong.

- [ ] **Step 5: Commit**

```bash
git add be/src/auth/auth.controller.ts be/src/auth/auth.service.ts be/test/api.e2e-spec.ts
git commit -m "feat(auth): route start/callback cho Google OAuth, dung PKCE S256"
```

---

### Task 5: Nút Google ở màn auth

**Files:**
- Modify: `FE/lib/auth-form.ts` (thêm `googleStartUrl` + `OAUTH_MESSAGES`)
- Modify: `FE/app/ui/AuthForm.tsx`
- Test: `FE/lib/auth-form.test.ts`

**Interfaces:**
- Produces: `googleStartUrl(redirectTo: string): string` → `https://<BE>/api/auth/oauth/google/start?redirect_to=...`
- Produces: `OAUTH_MESSAGES: Record<string, string>` khoá `cancelled|expired|exists|failed|unverified`

- [ ] **Step 1: Viết test đỏ**

Thêm vào `FE/lib/auth-form.test.ts`:

```ts
import { googleStartUrl, OAUTH_MESSAGES, API_URL } from './auth-form';

describe('googleStartUrl', () => {
  it('trỏ thẳng route start của BE, mang redirect_to đã an toàn', () => {
    expect(googleStartUrl('/problem/two-sum')).toBe(
      API_URL + '/api/auth/oauth/google/start?redirect_to=' + encodeURIComponent('/problem/two-sum'),
    );
  });

  it('redirect_to ngoài nội bộ bị thay bằng trang chủ trước khi gửi lên BE', () => {
    expect(googleStartUrl('https://evil.com')).toContain(
      'redirect_to=' + encodeURIComponent('/'),
    );
  });
});

describe('OAUTH_MESSAGES', () => {
  it('có câu cho mọi mã BE trả về', () => {
    for (const k of ['cancelled', 'expired', 'exists', 'failed', 'unverified']) {
      expect(typeof OAUTH_MESSAGES[k]).toBe('string');
      expect(OAUTH_MESSAGES[k].length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 2: Chạy test, phải đỏ**

Run: `cd FE && pnpm vitest run lib/auth-form.test.ts`
Expected: FAIL — `googleStartUrl is not a function`

- [ ] **Step 3: Viết implementation**

Thêm vào cuối `FE/lib/auth-form.ts`:

```ts
/** Link bắt đầu OAuth. Chạy `safeRedirect` trước khi gửi lên BE. */
export function googleStartUrl(redirectTo: string): string {
  return `${API_URL}/api/auth/oauth/google/start?redirect_to=${encodeURIComponent(
    safeRedirect(redirectTo),
  )}`;
}

/**
 * Câu cho từng mã BE trả về qua `?oauth=`.
 *
 * `exists` là câu quan trọng nhất: nó phải nói rõ **phải đăng nhập bằng mật
 * khẩu trước**, nếu không người dùng sẽ bấm Google lại mãi.
 */
export const OAUTH_MESSAGES: Record<string, string> = {
  cancelled: "Bạn đã hủy đăng nhập bằng Google. Dùng email và mật khẩu cũng được.",
  expired: "Phiên đăng nhập Google đã hết hạn. Bấm nút Google lần nữa để làm mới.",
  exists: "Email này đã có tài khoản. Đăng nhập bằng mật khẩu trước, rồi bấm Google là sẽ gộp vào tài khoản cũ.",
  failed: "Không lấy được thông tin từ Google. Thử lại sau một lát.",
  unverified: "Google chưa xác minh email này, nên mình không tạo được tài khoản. Hãy dùng email và mật khẩu.",
};
```

- [ ] **Step 4: Chạy test, phải xanh**

Run: `cd FE && pnpm vitest run lib/auth-form.test.ts`
Expected: PASS

- [ ] **Step 5: Thêm nút vào `AuthForm`**

Trong `AuthForm.tsx`, thêm import `googleStartUrl`, `OAUTH_MESSAGES`, và ngay **trước**
khối `<button type="submit">` thêm:

```tsx
        <a
          href={googleStartUrl(redirectTo)}
          className={`${SECONDARY} mt-3`}
          data-testid="google-signin"
        >
          <GoogleMark aria-hidden className="size-4" />
          Tiếp tục với Google
        </a>
```

Và ở đầu component, đọc lỗi OAuth trên URL:

```tsx
  const oauthCode = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("oauth");
  const oauthMessage = oauthCode ? OAUTH_MESSAGES[oauthCode] : null;
```

Render nó ngay dưới tiêu đề, trước form:

```tsx
      {oauthMessage && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-sm leading-relaxed text-amber-900">{oauthMessage}</p>
        </div>
      )}
```

`GoogleMark` và `SECONDARY` phải import từ `./auth-tokens`; nếu chưa có `GoogleMark`,
dùng SVG nội tuyến 20×20 của logo Google — **không thêm dependency icon mới**.

- [ ] **Step 6: Toàn bộ FE**

Run: `cd FE && pnpm exec tsc --noEmit && pnpm run lint && pnpm test && pnpm run build`
Expected: 0 lỗi; test 89 + 2 mới; build xong.

- [ ] **Step 7: Thêm test Playwright**

Thêm vào `e2e/smoke.spec.ts`:

```ts
test('/sign-in có nút Google và hiện câu khi OAuth thất bại', async ({ page }) => {
  await page.goto('/sign-in?oauth=exists');
  await expect(page.getByTestId('google-signin')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Đăng nhập bằng mật khẩu trước/)).toBeVisible();
});
```

Run: `npx playwright test`
Expected: 10 passed

- [ ] **Step 8: Commit**

```bash
git add FE e2e/smoke.spec.ts
git commit -m "feat(auth): nut Google o man auth + hien loi OAuth theo ma BE"
```

---

### Task 6: Cập nhật ledger + tài liệu

**Files:**
- Modify: `.superpowers/sdd/2026-09-27-remove-clerk/progress.md` (file này bị gitignore —
  cập nhật tại chỗ, không commit)
- Modify: `README.md` (dòng "Env bắt buộc trên BE")
- Modify: `be/.env.example`

- [ ] **Step 1: Thêm biến môi trường vào `be/.env.example`**

```bash
# Google OAuth (đăng nhập bằng Google). redirect_uri phải khớp CHÍNH XÁC
# bản đăng ký trong Google Cloud Console.
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=replace-me
GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/oauth/google/callback
```

- [ ] **Step 2: Cập nhật README**

Trong mục "Deploy (Vercel)", thêm vào danh sách env bắt buộc: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

- [ ] **Step 3: Ghi vào ledger**

Thêm mục "Google OAuth" vào `.superpowers/sdd/2026-09-27-remove-clerk/progress.md`,
ghi rõ: bốn nhánh tài khoản, `needs-password` là ranh giới bảo mật, khớp theo `sub`,
và việc test thật phải bấm tay.

- [ ] **Step 4: Commit**

```bash
git add README.md be/.env.example
git commit -m "docs: them bien Google OAuth vao .env.example va README"
```

---

## Test thật — không mock được

Các task trên test được mọi thứ **sau** callback. Phần `start` → Google → callback
không mock được vì cần một Google Cloud OAuth client thật.

Cách chạy (một lần, tay):

1. Google Cloud Console → Credentials → OAuth client ID (Web application)
2. Authorized redirect URI: `http://localhost:4000/api/auth/oauth/google/callback`
3. Điền 3 biến vào `be/.env`
4. Mở `http://localhost:3000/sign-in`, bấm nút Google
5. Kiểm: đã set cookie `session`, `GET /api/auth/me` trả user, và bảng `UserAccount`
   có 1 dòng với `provider='google'`

Nếu chưa có Google Cloud client, hãy dừng ở Task 5 và báo lại — **không** báo
"đã xong" khi chưa bấm tay lần nào.

## Thứ tự làm

Task 1 → 2 → 3 → 4 → 5 → 6, theo thứ tự. Dừng ngay ở Task 1 nếu `migrate dev` hỏi
xoá dữ liệu — `UserAccount` và `UserOAuthState` đều bảng mới, nhưng hãy đọc kỹ câu hỏi
trước khi trả lời.
