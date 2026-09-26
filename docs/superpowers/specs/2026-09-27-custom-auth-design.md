# Bỏ Clerk — dựng đăng nhập / đăng ký riêng

Ngày: 2026-09-27 · Trạng thái: đã duyệt 3 phần, chờ rà spec

## Mục tiêu

Thay Clerk bằng hệ đăng nhập tự quản lý, giữ nguyên mọi thứ không liên quan: 56 bài, chấm Judge0, streak, huy hiệu, premium, bảng quản trị.

## Vì sao không phải dựng từ số 0

Bảng quản trị đã có sẵn đúng hình dạng cần dùng:

- `be/src/admin/admin.guard.ts:10` đọc token từ cookie httpOnly
- `be/src/admin/admin.service.ts:11-12` đã có `bcryptjs` + `jsonwebtoken`, ký RS256
- `be/src/roles.guard.ts` đã định nghĩa `UserRole = 'user' | 'vip' | 'admin'`
- Env đã có `JWT_SECRET`, `ADMIN_PASSWORD_HASH`

Công việc là làm pattern đó dùng được cho user, không phải thiết kế lại.

## Quyết định đã chốt

| Quyết định | Lựa chọn | Hệ quả |
|---|---|---|
| Dữ liệu user cũ | Xoá hết, làm lại từ đầu | Không cần backfill. Không hoàn tác được → `pg_dump` trước. |
| Phiên | Access token ngắn hạn trong cookie httpOnly | Không thêm dependency. Cần cấu hình `SameSite` theo môi trường. |
| Đăng ký | Mở, có xác minh email | Dùng `nodemailer` + Mailtrap đã có sẵn. |
| Việc của trang | Ưu tiên Operate — vào app nhanh | Thuyết phục đã nằm ở cột trái `AuthShell`, không lặp lại trong form. |
| Xác minh email | Nói rõ trước khi đăng ký | Thêm màn hình "đã gửi link" kèm nút gửi lại. |
| Phạm vi sửa | Chỉ thay khối Clerk | Giữ `AuthShell`, `DESIGN.md`, metadata, URL. |

## Mô hình dữ liệu

Bảng `User` (`be/prisma/schema.prisma:16-24`) hiện có `id`, `email`, `name`, `nothing`, `clerkId`. Đổi thành:

- Bỏ `clerkId`, bỏ `nothing` (cột rỗng, không rõ dùng để làm gì).
- Thêm `passwordHash String?` — null khi tài khoản chưa đặt mật khẩu.
- Thêm `role String @default("user")` — thay cho vai trò nằm trong Clerk metadata.
- Thêm `vipExpiresAt DateTime?` — thay cho `expiresAt` trong Clerk metadata.
- Thêm `emailVerifiedAt DateTime?` — null nghĩa là chưa xác minh.
- Thêm `stripeSubscriptionId String?`, `premiumPlan String?` — `premium.service.ts` ghi hai chỗ này vào Clerk.
- Thêm `refreshTokenHash String?`, `prevRefreshTokenHash String?`, `prevRefreshValidUntil DateTime?` — phục vụ xoay vòng có đệm.

Một giới hạn của cách đặt này, cần biết: mỗi tài khoản chỉ có **một** refresh token đang sống. Đăng nhập ở thiết bị thứ hai sẽ làm thiết bị thứ một mất phiên. Chấp nhận được với nền tảng luyện tập cá nhân; nếu sau này cần nhiều thiết bị cùng lúc thì chuyển refresh token sang bảng `UserToken` với `type = 'refresh'`.

Token dùng một lần và có hạn — xác minh email, đặt lại mật khẩu — gom vào một bảng riêng thay vì mỗi loại một cặp cột:

```
model UserToken {
  id        String   @id @default(cuid())
  userId    Int
  type      String   // 'verify_email' | 'reset_password'
  tokenHash String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())

  @@index([userId, type])
  @@index([tokenHash])
}
```

Chỉ lưu hash, không lưu token gốc. Một chỗ lưu, một chỗ có index, và thêm đổi email sau này chỉ cần thêm một giá trị `type`.

Bảng `User` hiện chưa có quan hệ với 7 bảng kia. Đổi `clerkId String` → `userId Int` trỏ `User.id` ở: `ActivityDay`, `SolvedProblem`, `FavoriteProblem`, `Submission`, `UserBadge`, `PageView`, `LoginEvent`. Thêm index trên `userId` cho từng bảng.

`PageView.clerkId` chỉ dùng để đo "người dùng" trong analytics; khách chưa đăng nhập vẫn ghi `null` như hiện tại.

## Hợp đồng API

| Method | Đường dẫn | Cookie | Trả về |
|---|---|---|---|
| POST | `/api/auth/register` | không | `{ message }` — tạo user chưa xác minh, gửi mail, chưa cấp phiên |
| GET | `/api/auth/verify?token=` | đặt cả hai | `{ user }` — xác minh rồi đăng nhập luôn |
| POST | `/api/auth/forgot-password` | không | `{ message }` — luôn trả 200, dù email có hay không |
| POST | `/api/auth/reset-password` | xoá cả hai | `{ user }` — đổi mật khẩu, xoá mọi phiên đang có |
| POST | `/api/auth/login` | đặt cả hai | `{ user, expiresIn }` |
| POST | `/api/auth/refresh` | xoay vòng cả hai | `{ user, expiresIn }` |
| POST | `/api/auth/logout` | xoá cả hai | `{ ok: true }` |
| GET | `/api/auth/me` | không | `{ user, expiresIn }` |

`session` — access token, 15 phút. `refresh` — 30 ngày, lưu hash trong DB để thu hồi được.

Mã dùng một lần và có hạn, xem mục Bảo mật bên dưới.

Mã trả về: 400 cho dữ liệu sai, 401 cho thông tin đăng nhập sai, 409 cho email đã có, 429 khi vượt giới hạn. Cả 401 "email không tồn tại" và 401 "sai mật khẩu" dùng **cùng một thông báo**, để không lộ email nào đã đăng ký. `forgot-password` cũng trả 200 với cùng câu đó cho mọi email.

Mọi lỗi trả thông báo tiếng Việt, tên trường lỗi cũng tiếng Việt, không trả lộ có email tồn tại hay không.

## Bảo mật

**Cookie.** `SameSite=Lax; Secure=false` ở local, `SameSite=None; Secure=true` ở production, vì BE và FE nằm trên hai domain Vercel khác nhau nên cookie là cross-site. `main.ts:10` đã bật `credentials: true` với origin allowlist cứng trong `be/src/cors.ts`, nên phần CORS không phải sửa.

**Không cài `cookie-parser`.** `admin.guard.ts:18-28` đang tự parse header `Cookie` thủ công, nghĩa là dep này chưa chắc có. `AuthGuard` dùng lại đúng cách đó.

**Xoay vòng refresh có đệm.** Hai tab cùng refresh sẽ khiến tab thứ hai dùng token đã bị thu hồi. Vì vậy giữ hash token vừa thay trong 30 giây (`prevRefreshTokenHash` + `prevRefreshValidUntil`) để chịu được, thay vì bắt người dùng đăng nhập lại vì lỡ tay mở hai tab.

**Access token trong cookie httpOnly nên JS không đọc được hạn.** Vì vậy `login` và `me` trả kèm `expiresIn` để phía FE refresh chủ động, thay vì để mọi request 401 rồi mới thử lại.

**Giới hạn tần suất.** `register`, `login`, `refresh` dùng `ThrottleGuard` sẵn có. `verify` giới hạn theo IP để không bị dò mã. `forgot-password` giới hạn theo cả email lẫn IP.

**Mật khẩu.** 8 ký tự trở lên, bcrypt, không cấu hình phức tạp thêm. Tài khoản chưa xác minh thì không được đăng nhập.

**Mã xác minh email** hết hạn sau 24 giờ. **Mã đặt lại mật khẩu** hết hạn sau 1 giờ — ngắn hơn hẳn, vì nó trực tiếp mở quyền truy cập. Cả hai dùng một lần: dùng xong thì đặt `usedAt`, bấm lại trả 400.

**Đổi mật khẩu phải xoá mọi phiên đang có**, kể cả `refreshTokenHash` và `prevRefreshTokenHash`. Không làm vậy thì kẻ trộm được cookie trước khi đổi mật khẩu vẫn vào được app, đúng lúc người dùng cần nó nhất.

**Chống dò và chống spam trên luồng quên mật khẩu.** `forgot-password` giới hạn cả theo email lẫn theo IP — chỉ giới hạn theo IP thì kẻ xấu đổi IP vẫn bắn thư rác được. So sánh mã bằng thời gian cố định.

## Phía mặt trước

- `AuthProvider` mới — context phía client, gọi `/api/auth/me` một lần lúc khởi động, thay cho `useUser()` của Clerk.
- `FE/lib/swr.ts:10` — `authedFetcher` bỏ tham số `getToken`, thêm `credentials: "include"`. Các nơi gọi chỉ cần bỏ đối số.
- `FE/app/sign-in/[[...sign-in]]/page.tsx` và `sign-up/[[...sign-up]]/page.tsx` — 17 dòng mỗi file, thay `<SignIn/>` / `<SignUp/>` bằng form thật.
- Trang mới `/reset-password` — đọc `token` từ query, cho nhập mật khẩu mới rồi gửi `POST /api/auth/reset-password`. Kế thừa `AuthShell` y hệt hai trang trên, nên không phát sinh thế giới hình ảnh mới. Link "Quên mật khẩu?" nằm trong form đăng nhập, dẫn sang `/forgot-password`.
- `FE/app/layout.tsx` — bỏ `ClerkProvider`.
- `FE/app/proxy.ts` — bỏ middleware Clerk.
- Các file còn lại dùng `useUser()`: `Navbar.tsx`, `PremiumGuard.tsx`, `ViewTracker.tsx`, `app/page.tsx`, `useDashboard.ts` — đổi sang context mới.
- `FE/app/ui/AuthShell.tsx` — **không đụng**.

## Mặt quản trị

`premium.service.ts` và `admin.guard.ts` giữ nguyên cơ chế RS256 hiện có. Cần rà chỗ `premium.service.ts` ghi role và hạn VIP: từ ghi vào Clerk metadata sang ghi vào cột `User.role` và `User.vipExpiresAt`. `clerk-auth.guard.ts:115-127` hiện tự hạ VIP khi hết hạn ở mỗi request — chuyển thành so với `vipExpiresAt` trong DB.

Xoá `@clerk/backend` khỏi BE sau khi không còn chỗ nào gọi. Biến môi trường `CLERK_SECRET_KEY` và `CLERK_AUTHORIZED_PARTIES` xoá sau khi deploy xong.

## Kế hoạch chuyển dữ liệu

1. `pg_dump` toàn bộ database ra file `.sql` đặt ngoài repo.
2. Xoá dữ liệu user ở 7 bảng và bảng `User`.
3. Đổi schema, chạy migration.
4. Giữ nguyên `Problem` và toàn bộ nội dung bài.

Bước 1 là bắt buộc và không tự động hoá — không có bản sao thì mất vĩnh viễn.

## Kiểm thử

- Unit: hash và so mật khẩu, ký và xác minh token, xoay vòng refresh kèm đệm, chữa token quá hạn, `AuthGuard` với cookie thiếu / hỏng / hết hạn. Mã dùng một lần và mã hết hạn theo từng loại.
- E2E: đăng ký → nhận token xác minh (giả lập mail) → xác minh → đã đăng nhập. Đăng nhập sai mật khẩu bị từ chối. Tài khoản chưa xác minh không đăng nhập được. Refresh xoay cookie. Endpoint có guard trả 401 khi không có cookie. Quên mật khẩu trả 200 với email không tồn tại. Đặt lại mật khẩu xoá phiên cũ nên cookie cũ hết hiệu lực. Mã đặt lại mật khẩu dùng lần hai bị từ chối.
- Regression: toàn bộ 71 unit test và 12 e2e hiện có phải xanh sau khi đổi tên cột.

## Ngoài phạm vi

- Đổi email. Cần `UserToken` thêm một giá trị `type`, không cần sửa bảng.
- Đăng nhập bằng Google, GitHub hay social.
- Hai yếu tố xác thực.
- Bỏ bảng quản trị.

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Xoá dữ liệu không thể quay lại | `pg_dump` trước, lưu ngoài repo |
| Cookie cross-site hỏng ở production | `SameSite=None; Secure` khi deploy, kiểm tra trên domain thật |
| Xoay vòng refresh giết phiên khi mở hai tab | Đệm 30 giây cho token vừa thay |
| FE gọi hụt khi token hết hạn | `expiresIn` + refresh chủ động |
| Lọt endpoint do sót guard | Test 401 cho từng endpoint sau khi chuyển |
