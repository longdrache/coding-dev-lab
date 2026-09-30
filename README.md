# GoCode — nền tảng luyện thuật toán

Chấm code tự động bằng Judge0: 56 bài tập cấu trúc dữ liệu và giải thuật (Dễ / Trung bình / Khó),
8 ngôn ngữ, streak và bản đồ nhiệt tiến độ, gói Premium trả phí, cùng một trang quản trị riêng.
Toàn bộ giao diện, tên bài và thông báo lỗi bằng tiếng Việt.

| Trang chủ | Danh sách bài |
| --- | --- |
| ![Trang chủ GoCode](docs/images/trang-chu.png) | ![Danh sách 56 bài tập](docs/images/danh-sach-bai.png) |

> Ảnh trong README chụp từ bản chạy local với **dữ liệu mồi** (tài khoản `@example.test`,
> số liệu analytics tự sinh). Không ảnh nào chứa dữ liệu người dùng thật.

## Sản phẩm gồm những gì

| App | Thư mục | Cổng local | Vai trò |
| --- | --- | --- | --- |
| FE | `FE/` | 3000 | Sân luyện: trang chủ, danh sách bài, trang bài + trình soạn thảo, Premium, tiến độ, hỏi đáp, đăng nhập |
| Admin | `admin/` | 3001 | Trang quản trị: dashboard, duyệt bài, học viên, bài nộp, hỏi đáp |
| BE | `be/` | 4000 | API NestJS: bài tập, chấm bài, tiến độ, phiên đăng nhập, Premium, admin, analytics |

```
  FE  :3000  ─┐                        Next.js 16 + React 19
               ├─▶  BE (NestJS 12)  :4000 ──▶  Judge0  :2358
  Admin :3001 ─┘   tự quản lý cookie          chấm batch, CPU 2s, RAM 128MB
                    │      (Admin đi qua        header X-Auth-Token
                    │       BFF proxy)
                    ├──▶  Postgres  (Prisma 7)
                    ├──▶  Brevo    (SMTP: xác minh email, đặt lại mật khẩu, trả lời hỏi đáp)
                    └──▶  Stripe   (gói Premium + webhook)
```

## Tính năng

### Sân luyện

- **Trình soạn thảo Monaco** với 8 ngôn ngữ: Python 3, JavaScript, TypeScript, C++ 17, PHP,
  Java, C#, Go (`FE/app/problem/[slug]/page.tsx`).
- **Chạy test mẫu và nộp bài.** Nộp bài thì BE gửi **test ẩn** lên Judge0; test ẩn bị cắt khỏi
  mọi response gửi cho client, kể cả khi tài khoản có VIP
  (`be/src/problems/problems.service.ts`). Mỗi bài tối đa 10 test ẩn.
- **Lịch sử nộp bài** theo từng bài, xem lại mã nguồn và kết quả từng lần nộp.

![Trang bài với trình soạn thảo Monaco](docs/images/bai-tap-mon-code.png)

### Tiến độ

- **Streak** chuỗi ngày liên tiếp, **bản đồ nhiệt 35 ngày**, **12 huy hiệu** mở theo điều kiện
  (chuỗi ngày, số bài đã giải, số bài theo độ khó) — `be/src/progress/progress.service.ts`.
- **Đã giải / yêu thích** lưu trên server, đồng bộ giữa các máy.
- **Tiến độ theo 8 chủ đề** (mảng & con trỏ, chuỗi, danh sách liên kết, stack & hàng đợi, cây & đồ thị,
  quy hoạch động, sắp xếp & tìm kiếm, hàm bấm & tập hợp).

![Streak, bản đồ nhiệt và huy hiệu](docs/images/streak-va-huy-hieu.png)

![Tiến độ theo chủ đề](docs/images/tien-do-theo-chu-de.png)

### Bài VIP và gói Premium

- **20 bài VIP** trong 56 bài, chỉ tài khoản `role = vip` mới mở được. Quyền quyết định bằng `role`
  đã ký trong access token, không đọc cột `isVip` của bài — `be/src/problems/vip-problem.policy.ts`.
  Người chưa nâng cấp chỉ thấy tên bài và lời mời nâng cấp, không lọt mô tả, test hay trình soạn thảo.

![Bài VIP bị khoá với tài khoản thường](docs/images/bai-vip.png)

- **3 gói** (`FE/app/data/pricing.ts`): 200 ₫/ngày, 1.000 ₫/tháng, 2.000 ₫/năm. Thanh toán qua
  Stripe Checkout, giá và kỳ hạn gửi thẳng trong `price_data` nên không cần khai price ID.
- **Webhook idempotent**: mỗi event Stripe ghi vào bảng `StripeEvent`, nên retry webhook không
  gia hạn VIP hai lần. Hết hạn thì tự hạ VIP, không cần nhớ hủy.

![Bảng giá Premium](docs/images/premium.png)

### Tài khoản

- **Đăng ký kèm xác minh email**, gửi lại link xác minh, và đặt lại mật khẩu qua email
  (`/register`, `/verify`, `/forgot-password`, `/reset-password`).
- **Đăng nhập bằng Google (OAuth 2.0 + PKCE S256)**. Nút Google ở cả `/sign-in` và `/sign-up`.
  Toàn bộ thỏa thuận nằm ở BE, FE chỉ có một liên kết tới `GET /api/auth/oauth/google/start`.
- Mật khẩu băm **bcrypt**; access token **RS256 hạn 15 phút**; refresh token hạn 30 ngày, xoay vòng
  theo từng thiết bị và chỉ giữ 10 phiên mới nhất.

![Đăng nhập bằng mật khẩu hoặc Google](docs/images/dang-nhap-google.png)

### Trang quản trị

- **Dashboard**: lượt truy cập 30 ngày, số online, tổng bài / hỏi đáp / bài nộp, biểu đồ chạy và nộp
  bài theo ngày, bài được nộp nhiều nhất, đăng nhập gần đây theo quốc gia.

![Dashboard quản trị](docs/images/admin-dashboard.png)

- **Học viên**: danh sách tài khoản, vai trò, tìm theo email / tên / ID.

![Danh sách học viên](docs/images/admin-hoc-vien.png)

- **Bài nộp**: ai nộp bài nào, ngôn ngữ, kết quả, thời gian chạy, và xem lại mã nguồn.

![Danh sách bài nộp](docs/images/admin-bai-nop.png)

- **Bài tập**: tạo / sửa / xoá, duyệt xuất bản, gỡ xuất bản, bật hoặc gỡ cờ VIP cho từng bài.

![Quản lý bài tập](docs/images/admin-quan-ly-bai-tap.png)

- **Hỏi đáp**: đọc câu hỏi của người dùng (kể cả khách chưa đăng nhập) và trả lời thẳng qua email.

![Hộp thư hỏi đáp](docs/images/admin-hoi-dap.png)

### Bảo mật

- Access token RS256 15 phút, refresh token xoay vòng theo thiết bị; admin ký cặp khoá RS256 riêng.
- Giới hạn tần suất: đăng nhập 30 lần/15 phút, đăng ký 20 lần/giờ, đăng nhập admin 5 lần/phút,
  gửi câu hỏi 5 lần/phút, nộp bài 30 lần/phút.
- Mọi input đi qua `ValidationPipe` với `whitelist`; route `PATCH /api/admin/problems/:slug/vip`
  còn bật `forbidNonWhitelisted` vì thân request đúng một trường.
- Analytics **không lưu IP thô**: chỉ lưu `sha256(IP_HASH_SALT + ":" + ip)`
  (`be/src/views/views.service.ts`), và chỉ đọc quốc gia qua header `x-vercel-ip-country`.
- Judge0: BE gắn header `X-Auth-Token` khi `JUDGE0_API_TOKEN` có giá trị. Để trống thì Judge0
  chạy public — ai cũng chấm được, nên production phải đặt token.

## Chạy local

Cần Node.js 22 (CI chạy 22), pnpm 10, và một Postgres. Judge0 chạy bằng Docker hoặc trỏ
`JUDGE0_URL` tới một Judge0 sẵn có.

```bash
# 1. Cài đặt
pnpm --dir be install
pnpm --dir FE install
pnpm --dir admin install

# 2. Tạo file env
#    be/.env.example    -> be/.env
#    FE/.env.example    -> FE/.env
#    admin/.env.example -> admin/.env

# 3. Đẩy schema rồi nạp 56 bài tập vào DB
pnpm --dir be exec prisma migrate deploy
pnpm --dir be exec node scripts/seed-problems.ts

# 4. Chạy
pnpm dev            # BE :4000 + FE :3000
pnpm dev-admin      # thêm Admin :3001
```

Lưu ý: script `be/scripts/*.ts` phải chạy qua `pnpm --dir be exec node <file>`. Viết
`pnpm --dir be node <file>` sẽ không chạy được — pnpm hiểu `be` là tên lệnh chứ không phải
thư mục.

Mấy điểm hay vấp:

- **`pnpm dev-admin` có thể đụng cổng.** Cả `FE` và `admin` đều chạy lệnh `next dev` nên cùng mặc
  định cổng 3000; app nào giành được cổng trước thì app kia tự nhảy sang 3001, và `FE/.env` +
  `admin/.env` trỏ `localhost:4000` nên vẫn chạy được nhưng lại lệch cổng so với tài liệu.
  Ghim port riêng cho chắc:
  ```bash
  pnpm --dir admin dev -p 3001   # chạy cửa sổ riêng
  pnpm dev                       # cửa sổ khác: BE :4000 + FE :3000
  ```
- **Tài khoản admin local**: `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `be/.env` (mặc định
  `admin` / `admin`). Đặt lại trước khi deploy.
- **`be/.env` đang trỏ Neon production.** Đổi `DATABASE_URL` sang Postgres local trước khi
  chạy `migrate deploy` hoặc `seed-problems.ts`, nếu không seed sẽ ghi thẳng vào DB thật.

## Biến môi trường

Nguồn: `be/.env.example`, `FE/.env.example`, `admin/.env.example`. Không có giá trị bí mật nào
nằm trong repo.

### BE (`be/.env`)

| Biến | Bắt buộc | Lấy ở đâu / ghi chú |
| --- | --- | --- |
| `DATABASE_URL` | có | **Không có trong `.env.example`** nhưng code bắt buộc (`be/src/database/database.service.ts`). `prisma7.config.ts` cũng đọc biến này khi migrate. |
| `DATABASE_URL_UNPOOLED` | nên có | Ưu tiên connection trực tiếp thay vì pooler. Thiếu thì rơi về `DATABASE_URL`. |
| `PORT` | không | Mặc định 4000. |
| `JUDGE0_URL` | có | URL Judge0, mặc định trong compose là `http://judge0-server:2358`. |
| `JUDGE0_API_TOKEN` | có | Token mà lớp bảo vệ trước Judge0 kiểm tra qua header `X-Auth-Token` (với Judge0 đặt `AUTHN_TOKEN` trong `judge0.conf`). Rỗng = Judge0 public. |
| `STRIPE_SECRET_KEY` | có | Bắt buộc cho trang Premium. |
| `STRIPE_WEBHOOK_SECRET` | có | Xác thực chữ ký webhook. Thiếu thì mọi webhook bị từ chối với `STRIPE_WEBHOOK_SECRET chưa được cấu hình`. |
| `FRONTEND_URL` | có | Origin của FE, dùng cho CORS và link trong mail. |
| `FRONTEND_ADMIN_URL` | không | Origin của Admin cho CORS. |
| `BREVO_SMTP_LOGIN` | có | Brevo → **SMTP & API** (tab *SMTP*). |
| `BREVO_SMTP_KEY` | có | Cùng trang đó. Xem cảnh báo bên dưới. |
| `MAIL_FROM` | có | Chỉ địa chỉ, phải là sender **đã xác minh** ở Brevo → *Senders & Domains*. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` | có | Tài khoản admin. Bcrypt hash tạo bằng `bcrypt.hashSync`. |
| `ADMIN_JWT_PRIVATE_KEY` / `ADMIN_JWT_PUBLIC_KEY` | có | Cặp RSA cho cookie admin (RS256). |
| `JWT_SECRET` | không | Chỉ là fallback HS256 cho cookie admin cũ. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | có | Google Cloud Console → APIs & Services → Credentials → OAuth client ID loại *Web application*. |
| `IP_HASH_SALT` | không | Muốn analytics đổi cột `ipHash` giữa các lần triển khai thì đặt. Không có thì dùng `gocode-views`. |

**Hai chỗ dễ sai nhất:**

1. `BREVO_SMTP_KEY` phải là **SMTP key** dạng `xsmtpsib-…`, **không phải API key** dạng
   `xkeysib-…`. Hai loại khoá này không dùng thay nhau được; dán nhầm API key thì SMTP fail bằng
   `535 authentication failed`. BE có chặn tiền tố `xkeysib-` và log lỗi nêu thẳng trước khi gửi
   (`be/src/auth/auth.mailer.ts`).
2. `MAIL_FROM` phải là sender **đã xác minh** trên Brevo; Brevo từ chối gửi từ địa chỉ chưa xác minh.

Thiếu bất kỳ biến mail nào thì lúc gửi BE log lỗi nêu đúng tên biến thiếu và **không gửi** — không
có địa chỉ dự phòng, không im lặng bỏ qua. `register` vẫn trả 200 (tài khoản đã tạo, người dùng bấm
"gửi lại link" được), `forgot-password` vẫn trả câu trả lời chung để không lộ email nào đã đăng ký.
Tìm lỗi gửi mail thì grep `thất bại` trong log BE.

### FE (`FE/.env`)

| Biến | Ghi chú |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | URL BE, mặc định `http://localhost:4000`. |

### Admin (`admin/.env`, `admin/.env.local`)

| Biến | Ghi chú |
| --- | --- |
| `BE_API_URL` | URL BE mà BFF proxy forward tới, chạy server-side. |
| `NEXT_PUBLIC_API_URL` | Dự phòng khi thiếu `BE_API_URL`. |
| `JWT_SECRET` | Chỉ dùng làm fallback HS256 khi verify RS256 thất bại (chỉ ở dev). |
| `ADMIN_JWT_PUBLIC_KEY` | Khoá công khai để `proxy.ts` verify cookie admin. |

## Phụ thuộc ngoài

| Phụ thuộc | Cần khi nào | Bắt buộc? |
| --- | --- | --- |
| **Postgres** | Mọi lúc — `DATABASE_URL` trỏ vào đây | Bắt buộc |
| **Judge0** (Docker) | Chạy test mẫu và nộp bài | Bắt buộc cho chấm code; danh sách bài vẫn xem được không cần |
| **Brevo** | Xác minh email, đặt lại mật khẩu, trả lời hỏi đáp | Không — thiếu thì các luồng đó log lỗi và bỏ qua gửi |
| **Google Cloud OAuth** | Nút "Tiếp tục với Google" | Không — thiếu thì nút báo `?oauth=failed` ngay khi bấm |
| **Stripe** | Gói Premium | Không — trang `/premium` vẫn hiện, chỉ không tạo được phiên thanh toán |

Judge0 local:

```bash
cd be && docker compose up -d      # judge0-server + 3 workers
docker compose restart judge0-server
```

Judge0 CE hỗ trợ auth ngay trong `judge0.conf`, không cần nginx:

```ini
AUTHN_TOKEN=<token-khoa-manh>
```

BE gắn header `X-Auth-Token: $JUDGE0_API_TOKEN` vào mọi request khi biến này có giá trị. CPU time
mặc định 2 giây (tối đa 5), RAM cố định 128MB cho mọi bài — `be/src/judge0/judge0.service.ts`.

## API chính

| Method & Path | Auth | Mô tả |
| --- | --- | --- |
| `GET /api/problems` | public | Danh sách bài đã xuất bản |
| `GET /api/problems/:slug` | public | Chi tiết bài (không kèm test ẩn) |
| `POST /api/problems/:slug/submit` | JWT cookie | Nộp bài: chấm test ẩn, ghi lịch sử + đánh dấu đã giải |
| `POST /api/submissions/batch` | JWT cookie | Gửi cả lô test lên Judge0 |
| `GET /api/submissions/batch?tokens=` | JWT cookie | Poll kết quả lô |
| `GET /api/history`, `POST /api/history` | JWT cookie | Lịch sử nộp bài |
| `GET /api/progress/dashboard` | JWT cookie | Streak, heatmap, huy hiệu, số bài đã giải |
| `GET /api/progress/solved`, `/favorites` | JWT cookie | Bài đã giải / yêu thích |
| `POST /api/auth/register`, `/login`, `/refresh`, `/logout` | public | Đăng ký và vòng đời phiên |
| `GET /api/auth/verify?token=` | public | Xác minh email từ link trong mail |
| `GET /api/auth/oauth/google/start`, `/callback` | public | Luồng OAuth Google |
| `POST /api/premium/checkout`, `/webhook` | JWT cookie / Stripe | Thanh toán |
| `GET /api/presence/online` | public | Số người đang online |
| `POST /api/qna` | public (giới hạn tần suất) | Gửi câu hỏi |
| `POST /api/admin/login` | admin | Đăng nhập admin |

## Cơ sở dữ liệu

Postgres qua Prisma 7. `be/prisma/schema.prisma` có 15 model: 14 bảng dùng thật và `Test` là
model stub chưa dùng.

| Bảng | Vai trò |
| --- | --- |
| `User` | Tài khoản: `role` (user/vip/admin), `vipExpiresAt`, `premiumPlan`, `avatarUrl` |
| `UserToken` | Refresh token theo thiết bị (xoay vòng, thu hồi từng thiết bị) |
| `UserAccount` | Liên kết OAuth — unique `(provider, providerUserId)` |
| `UserOAuthState` | State tạm của luồng OAuth, khoá theo hash |
| `ActivityDay` | Streak và bản đồ nhiệt — unique `(userId, date)` |
| `SolvedProblem` | Bài đã giải — unique `(userId, slug)` |
| `FavoriteProblem` | Bài yêu thích — unique `(userId, slug)` |
| `UserBadge` | Huy hiệu đã mở — unique `(userId, badgeId)` |
| `Problem` | Bài tập: `isVip`, `tests`, `hiddenTests`, `starterCodes`, `status` |
| `Submission` | Lịch sử nộp bài: `status`, `passed`, `time`, `memory`, `sourceCode` |
| `QnaQuestion` | Câu hỏi hỗ trợ, `userId` nullable để khách không cần đăng nhập |
| `StripeEvent` | Event Stripe đã xử lý — idempotency chống gia hạn VIP hai lần |
| `PageView` | Analytics trang — `ipHash` (không lưu IP thô) |
| `LoginEvent` | Lượt đăng nhập — `ipHash`, `country` |

Quan hệ chính: `User` 1—N các bảng dữ liệu. `onDelete: Cascade` cho dữ liệu thuộc user;
`QnaQuestion`, `PageView`, `LoginEvent` để lại dòng (nullable `userId`) khi user bị xoá.

## Chạy test

```bash
pnpm --dir be test         # vitest: unit + service
pnpm --dir FE test         # vitest
pnpm --dir admin test      # node --test
pnpm test:e2e              # Playwright, tự bật FE (playwright.config.ts)
```

`pnpm --dir be test:e2e` cần một Postgres local và chạy `be/scripts/guard-e2e-db.mjs` trước. Script
này chặn e2e khi `DATABASE_URL` trỏ vào Neon (`*.neon.tech`) trừ khi bạn cố ý đặt
`E2E_ALLOW_PROD=1` — vì e2e ghi và xoá dữ liệu thật.

## Deploy

- FE, Admin, BE là ba project Vercel riêng. BE chạy qua `be/api/index.ts` (`be/vercel.json`).
- Biến bắt buộc trên BE khi deploy: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `JUDGE0_URL`, `JUDGE0_API_TOKEN`, `ADMIN_*`, `FRONTEND_URL`,
  `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY`, `MAIL_FROM`, và ba biến `GOOGLE_*`.
- `ADMIN_PASSWORD=admin` và `JWT_SECRET` mặc định **không được** để nguyên khi deploy.
- Stripe webhook trỏ tới `https://<be-domain>/api/premium/webhook`.
- Admin và BE khác domain nên cookie admin chạy `SameSite=None; Secure` khi
  `NODE_ENV=production` hoặc `VERCEL=1` (`be/src/admin/admin.controller.ts`).

## Tài liệu khác

- `PRODUCT.md` — mục đích sản phẩm, đối tượng, nguyên tắc sản phẩm.
- `DESIGN.md` — hệ thống hình ảnh.
- `docs/superpowers/specs/` — thiết kế tính năng: custom auth, Google OAuth, admin, UI.
- `be/src/**/*.spec.ts` — test chi tiết từng service, là tài liệu hành vi đáng tin hơn README.
