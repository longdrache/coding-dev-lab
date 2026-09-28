# Đăng nhập bằng Google (OAuth) — thiết kế

Ngày: 2026-09-28
Trạng thái: chờ người dùng duyệt

## Vì sao có việc này

Hệ đăng nhập tự quản lý (thay Clerk) đã xong: đăng ký, xác minh email, quên/đặt lại
mật khẩu, nhiều thiết bị. Còn thiết hai thứ người dùng hỏi:

- **Đổi mật khẩu** — chưa có. BE chỉ có `forgot-password` / `reset-password`.
- **Đăng nhập bằng Google** — chưa có.

Đăng xuất trong dropdown avatar **đã có sẵn** (`FE/app/page.tsx:451`, gọi `signOut()`,
BE có `POST /api/auth/logout`). Không viết lại; chỉ cần kiểm nó chạy đúng.

## Quyết định đã chốt

| Câu hỏi | Chốt |
|---|---|
| Đặt OAuth ở app nào? | **BE (NestJS)** |
| Thư viện? | **SDK trực tiếp** — `google-auth-library`. Không dùng Passport, không Auth.js |
| Bao nhiêu provider? | **Chỉ Google**. Bỏ GitHub |
| Ghép tài khoản? | Tự ghép **khi đang đăng nhập**; chưa đăng nhập thì **không** ghép |
| `email_verified`? | Chỉ tin khi `true` |
| Màn "liên kết thêm" trong cài đặt? | **Không làm** bây giờ |

### Vì sao đặt ở BE

Cookie phiên do BE set (`setSessionCookies` trong `auth.controller.ts`) và BE verify ở
mọi request (`AuthGuard`, RS256). `AuthProvider` ở FE chỉ đọc cookie đó qua `/me`.

Đặt OAuth ở FE với Auth.js sẽ tạo **session thứ hai** — khoá bằng `AUTH_SECRET` của
Auth.js, không phải token RS256 của BE. Hai nguồn sự thật về "ai đang đăng nhập" là
chỗ dễ hỏng âm thầm. Đặt ở BE thì `AuthProvider` không đổi một dòng nào.

### Vì sao không dùng Passport

Passport theo mô hình middleware cũ và gần như không còn được bảo trì. Với Google, phần
cần tự viết chỉ ba bước (sinh `state`, đổi `code`, lấy profile) — nhưng tự viết thì
kiểm chứng được PKCE, `state` chống CSRF và kiểm `redirect_uri`. Quan trọng hơn 50 dòng
tiết kiệm.

### Vì sao bỏ GitHub

GitHub **không bắt buộc trả email**. Với user ẩn email, ta chỉ có
`xxxx@users.noreply.github.com` — không khớp tài khoản nào, và tạo tài khoản mới sẽ
làm mất dữ liệu. Cách xử lý đúng (bắt nhập email + xác minh) tốn công hơn giá trị lúc
này.

## Phạm vi

**Có:**
- `UserAccount` (bảng mới)
- `GET /api/auth/oauth/google/start` — phát redirect, kèm `state` + PKCE
- `GET /api/auth/oauth/google/callback` — xử lý kết quả
- FE: nút "Đăng nhập bằng Google" ở `/sign-in` và `/sign-up`
- Màn "tài khoản đã tồn tại, hãy đăng nhập bằng mật khẩu rồi bấm lại"

**Không có (lần này):**
- Đổi mật khẩu — tách thành spec riêng, không gộp
- GitHub
- Màn cài đặt "liên kết thêm"
- Hợp nhất nhiều tài khoản Google với một tài khoản

## Kiến trúc

```
FE  /sign-in  ──► GET /api/auth/oauth/google/start
                       │  sinh state (RS256 ký, TTL 10 phút) + code_verifier
                       │  lưu vào UserOAuthState
                       ▼
                  redirect ──► accounts.google.com
                                     │ user chấp nhận
                                     ▼
BE  /api/auth/oauth/google/callback?code&state
      1. kiểm state còn hạn + khớp, xoá dòng state
      2. đổi code → token → profile
      3. chọn nhánh tài khoản (bảng bên dưới)
      4. ghi UserAccount
      5. setSessionCookies()  ← dùng y hệt luồng hiện tại
      6. 302 về FE: /sign-in?redirect_url=... hoặc trang báo "đã tồn tại"
```

Bước 5 dùng chung `setSessionCookies` — **không phát sinh hệ phiên thứ hai**.

## Bảng dữ liệu

```prisma
model UserAccount {
  id              Int      @id @default(autoincrement())
  userId          Int
  provider        String   // 'google'
  providerUserId  String   // sub của Google, KHÔNG phải email
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerUserId])
  @@index([userId])
}
```

`UserAccount` không có `passwordHash`. Người dùng chỉ dùng Google thì cột
`User.passwordHash` để `null` — cần chỉnh lại schema để cho phép, và **endpoint đổi
mật khẩu phải từ chối** user không có mật khẩu (xem "Đổi mật khẩu" bên dưới).

`UserOAuthState` giữ `state` tạm:

```prisma
model UserOAuthState {
  stateHash    String   @id
  codeVerifier String
  redirectTo   String
  expiresAt    DateTime
  usedAt       DateTime?
}
```

`state` lưu dạng **hash** (sha256), không lưu bản rõ — rò rỉ bảng này cũng không cấp
được phiên. Xoá dòng ngay sau khi dùng, và có lịch dọn bản ghi hết hạn.

## Nhánh xử lý tài khoản — phần quan trọng nhất

Sau khi có `email` + `email_verified` từ Google:

| # | Tình huống | Việc |
|---|---|---|
| 1 | `email_verified !== true` | Từ chối, bảo dùng đường email/mật khẩu (token tạm, không ghi gì) |
| 2 | Không có `User` nào có email đó | Tạo `User` mới, `emailVerifiedAt = now()`, ghi `UserAccount` |
| 3 | Có `User`, **đang đăng nhập**, email khớp | Ghi `UserAccount` vào user đang đăng nhập |
| 4 | Có `User`, **chưa đăng nhập** | **Không ghép.** 302 về `/sign-in?oauth=exists` |

Nhánh 4 là ranh giới bảo mật. Nếu tự ghép theo email, kẻ nào đăng ký Google với email
của bạn cũng vào được tài khoản bạn. Bắt đăng nhập bằng mật khẩu là bằng chứng sở
hữu. Người dùng đăng nhập xong bấm lại nút Google thì rơi vào nhánh 3 — nối được.

Trường hợp `providerUserId` đã gắn với **user khác** trong khi email khác: từ chối
và log. Đây là dấu hiệu cấu hình lệch, không phải lỗi người dùng.

## `redirectTo` trong state

`redirectTo` lấy từ `?redirect_url=` và đi qua `safeRedirect` của FE (`lib/auth-form.ts`)
**trước khi** gửi lên BE — BE không tin dữ liệu từ trình duyệt. BE lưu vào
`UserOAuthState` và dùng lại khi callback. BE kiểm lại lần nữa khi redirect (chỉ nhận
đường dẫn nội bộ bắt đầu bằng `/`, không nhận `//`).

## Biến môi trường

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=https://<be-domain>/api/auth/oauth/google/callback
```

Không cần `GOOGLE_API_KEY`. `redirect_uri` phải khớp chính xác bản đăng ký trong
Google Cloud Console.

## Rủi ro đã biết

- **CSRF**: `state` ký RS256, TTL 10 phút, dùng một lần. Bắt buộc — thiếu nó là
  attacker gắn tài khoản Google của nạn nhân vào phiên của mình.
- **Chặn tài khoản**: Google cho `sub` ổn định; `email` có thể đổi, nên **luôn khớp
  theo `sub`**, không theo email.
- **Mất tài khoản**: user bỏ Google / bị khoá. Khi đó chỉ còn phiên hiện tại. Vì
  vậy user chỉ dùng Google nên được khuyến nghị đặt mật khẩu — cũng là lý do phần
  "Đổi mật khẩu" nên làm sớm.
- **Rate limit**: `/start` và `/callback` phải throttle, không để bị dùng để spam
  Google.

## Testing

- Unit (`auth.service.spec.ts`): từng nhánh 1-4, `state` hết hạn, `state` dùng lại,
  `email_verified=false`, `sub` đã gắn với user khác
- Unit (`oauth-state`): `redirectTo` ngoài nội bộ bị từ chối
- E2E (`api.e2e-spec.ts`): route mới phải chặn cookie rỗng/rác như các route khác
- Test thật: chạy `start` → đăng nhập Google thật → callback → kiểm cookie set và
  `UserAccount` ghi đúng. Cần Google Cloud OAuth client; không mock được.
- Mutation test theo chuẩn repo: bỏ nhánh kiểm `email_verified` thì test phải đỏ

## Đổi mật khẩu — ghi nhận, làm riêng

Cần thêm `POST /api/auth/change-password` (yêu cầu phiên + mật khẩu cũ đúng, mật khẩu
mới ≥ 8 ký tự, huỷ mọi phiên khác). Kèm: `User.passwordHash` phải cho phép `null`
vì user chỉ dùng Google; và **endpoint phải từ chối** user không có mật khẩu với
thông báo dạng "bạn đăng ký bằng Google, hãy dùng Google đăng nhập".

Tách khỏi spec này vì nó độc lập với OAuth, trừ một ràng buộc schema nêu trên.
