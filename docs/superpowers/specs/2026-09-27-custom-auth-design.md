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
- Thêm `verifyTokenHash String?`, `verifyExpiresAt DateTime?` — token xác minh email, lưu dạng hash.
- Thêm `refreshTokenHash String?`, `prevRefreshTokenHash String?`, `prevRefreshValidUntil DateTime?` — phục vụ xoay vòng có đệm.

Bảng `User` hiện chưa có quan hệ với 7 bảng kia. Đổi `clerkId String` → `userId Int` trỏ `User.id` ở: `ActivityDay`, `SolvedProblem`, `FavoriteProblem`, `Submission`, `UserBadge`, `PageView`, `LoginEvent`. Thêm index trên `userId` cho từng bảng.

`PageView.clerkId` chỉ dùng để đo "người dùng" trong analytics; khách chưa đăng nhập vẫn ghi `null` như hiện tại.

## Hợp đồng API

| Method | Đường dẫn | Cookie | Trả về |
|---|---|---|---|
| POST | `/api/auth/register` | không | `{ message }` — tạo user chưa xác minh, gửi mail, chưa cấp phiên |
| GET | `/api/auth/verify?token=` | đặt cả hai | `{ user }` — xác minh rồi đăng nhập luôn |
| POST | `/api/auth/login` | đặt cả hai | `{ user, expiresIn }` |
| POST | `/api/auth/refresh` | xoay vòng cả hai | `{ user, expiresIn }` |
| POST | `/api/auth/logout` | xoá cả hai | `{ ok: true }` |
| GET | `/api/auth/me` | không | `{ user, expiresIn }` |

`session` — access token, 15 phút. `refresh` — 30 ngày, lưu hash trong DB để thu hồi được.

Mã xác minh email hết hạn sau 24 giờ và dùng một lần: xác minh xong thì `verifyTokenHash` bị xoá, link bấm lần hai trả 400.

Mã trả về: 400 cho dữ liệu sai, 401 cho thông tin đăng nhập sai, 409 cho email đã có, 429 khi vượt giới hạn. Cả 401 "email không tồn tại" và 401 "sai mật khẩu" dùng **cùng một thông báo**, để không lộ email nào đã đăng ký.

Mọi lỗi trả thông báo tiếng Việt, tên trường lỗi cũng tiếng Việt, không trả lộ có email tồn tại hay không.

## Bảo mật

**Cookie.** `SameSite=Lax; Secure=false` ở local, `SameSite=None; Secure=true` ở production, vì BE và FE nằm trên hai domain Vercel khác nhau nên cookie là cross-site. `main.ts:10` đã bật `credentials: true` với origin allowlist cứng trong `be/src/cors.ts`, nên phần CORS không phải sửa.

**Không cài `cookie-parser`.** `admin.guard.ts:18-28` đang tự parse header `Cookie` thủ công, nghĩa là dep này chưa chắc có. `AuthGuard` dùng lại đúng cách đó.

**Xoay vòng refresh có đệm.** Hai tab cùng refresh sẽ khiến tab thứ hai dùng token đã bị thu hồi. Vì vậy giữ hash token vừa thay trong 30 giây (`prevRefreshTokenHash` + `prevRefreshValidUntil`) để chịu được, thay vì bắt người dùng đăng nhập lại vì lỡ tay mở hai tab.

**Access token trong cookie httpOnly nên JS không đọc được hạn.** Vì vậy `login` và `me` trả kèm `expiresIn` để phía FE refresh chủ động, thay vì để mọi request 401 rồi mới thử lại.

**Giới hạn tần suất.** `register`, `login`, `refresh` dùng `ThrottleGuard` sẵn có. `verify` giới hạn theo IP để không bị dò token.

**Mật khẩu.** - 8 ký tự trở lên, bcrypt, không cấu hình phức tạp thêm. Tài khoản chưa xác minh thì không được đăng nhập.

## Phía mặt trước

- `AuthProvider` mới — context phía client, gọi `/api/auth/me` một lần lúc khởi động, thay cho `useUser()` của Clerk.
- `FE/lib/swr.ts:10` — `authedFetcher` bỏ tham số `getToken`, thêm `credentials: "include"`. Các nơi gọi chỉ cần bỏ đối số.
- `FE/app/sign-in/[[...sign-in]]/page.tsx` và `sign-up/[[...sign-up]]/page.tsx` — 17 dòng mỗi file, thay `<SignIn/>` / `<SignUp/>` bằng form thật.
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

- Unit: hash và so mật khẩu, ký và xác minh token, xoay vòng refresh kèm đệm, chữa token quá hạn, `AuthGuard` với cookie thiếu / hỏng / hết hạn.
- E2E: đăng ký → nhận token xác minh (giả lập mail) → xác minh → đã đăng nhập. Đăng nhập sai mật khẩu bị từ chối. Tài khoản chưa xác minh không đăng nhập được. Refresh xoay cookie. Endpoint có guard trả 401 khi không có cookie.
- Regression: toàn bộ 71 unit test và 12 e2e hiện có phải xanh sau khi đổi tên cột.

## Ngoài phạm vi

- Đặt lại mật khẩu qua email và đổi email.
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
