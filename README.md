# GoCode — Nền tảng luyện thuật toán

Hệ thống chấm code tự động: 56 bài tập từ Dễ đến Khó, 8 ngôn ngữ, chấm batch realtime,
streak/heatmap, gói Premium (Stripe), trang quản trị riêng.

**Demo:** FE + Admin + BE deploy trên Vercel • DB Neon (Postgres) • Judge0 self-hosted

## Kiến trúc

```
┌─────────┐  ┌─────────┐
│   FE    │  │  Admin  │   Next.js 16 + React 19 (custom auth / JWT cookie)
│  :3000  │  │  :3001  │
└────┬────┘  └────┬────┘
     │            │  BFF proxy (admin, cùng-domain cookie)
     └─────┬──────┘
           ▼
┌─────────────────────┐      ┌──────────┐
│    BE (NestJS 12)   │─────▶│ Judge0   │  chấm batch 10, CPU 2s, RAM 128MB
│    :4000            │      │  :2358   │  auth X-Auth-Token (judge0.conf)
└────────┬────────────┘      └──────────┘
         │ Prisma 7                    ┌──────────┐
          ▼                             │ Auth     │  local user + token
┌─────────────────────┐                ├──────────┤
│  Neon (Postgres)    │                │ Stripe   │  Premium + webhook
└─────────────────────┘                └──────────┘
```

| App | Thư mục | Mô tả |
| --- | ------- | ----- |
| FE | `FE/` | Trang chủ, sân luyện, Premium, QNA, bảng tiến độ |
| Admin | `admin/` | Dashboard: duyệt bài, users, submissions, QNA + trả lời mail |
| BE | `be/` | API NestJS: problems, submissions, progress, premium, admin |

## Tính năng chính

- **Sân luyện**: editor Monaco, chạy test mẫu + nộp bài chấm test ẩn, lịch sử submissions
- **Tiến độ**: streak, heatmap, huy hiệu, tiến độ theo 8 chủ đề, đã giải/yêu thích đồng bộ server
- **Premium**: gói ngày/tuần/năm qua Stripe, tự hết hạn + hạ VIP, webhook idempotent
- **Bảo mật**: bcrypt, access token RS256 15 phút + refresh token xoay vòng theo từng thiết bị, admin RS256 riêng, throttle (login 30/15 phút, register 20/giờ), validate mọi input, Judge0 có token

## Chạy local

Yêu cầu: Node 20+, pnpm 10, Judge0 (Docker) hoặc dùng Judge0 sẵn có.

```bash
# 1. Cài đặt
pnpm --dir be install && pnpm --dir FE install && pnpm --dir admin install

# 2. Env: copy be/.env.example, FE/.env.example, admin/.env.example thành .env
#    Điền: DATABASE_URL, DATABASE_URL_UNPOOLED, STRIPE_*, JUDGE0_URL, JUDGE0_API_TOKEN,
#    ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_JWT_PRIVATE_KEY / PUBLIC_KEY,
#    EMAIL_HOST, EMAIL_USERNAME, EMAIL_PASSWORD, FRONTEND_URL,
#    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (xem mục dưới)

# 3. Đẩy schema (1 migration nền tạo đủ 13 bảng) + seed 56 đề
pnpm --dir be prisma migrate deploy
pnpm --dir be node scripts/seed-problems.ts

# 4. Chạy (BE + FE, thêm admin khi cần)
pnpm dev            # BE :4000 + FE :3000
pnpm dev-admin      # + Admin :3001 (kèm BE, FE)
```

Tài khoản admin mặc định dev: `admin` / `admin` (đặt `ADMIN_PASSWORD_HASH` khi deploy).

## Đăng nhập bằng Google (OAuth 2.0)

Nút "Tiếp tục với Google" ở cả `/sign-in` và `/sign-up` chạy OAuth 2.0 với
**PKCE S256** và `state` lưu trong DB (`UserOAuthState`). Không có "client secret
nào trong mã FE" — toàn bộ thỏa thuận nằm ở BE.

### Biến môi trường (BE)

| Biến | Lấy ở đâu | Ghi chú |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials → OAuth client ID (loại **Web application**) | |
| `GOOGLE_CLIENT_SECRET` | Cùng chỗ, cùng một client | Chỉ dùng ở bước đổi code lấy access token |
| `GOOGLE_REDIRECT_URI` | Khai trong "Authorized redirect URIs" | Phải là URL **của BE**, tuyệt đối khớp |

Thiếu **bất kỳ** biến nào trong ba thì `GET /api/auth/oauth/google/start` chuyển
thẳng về `/sign-in?oauth=failed` — cố ý kiểm sớm cả ba, vì thiếu riêng secret thì
người dùng phải đi trọn màn hình đồng ý bên Google rồi mới nhận lỗi.

Local: `GOOGLE_REDIRECT_URI=http://localhost:4000/api/auth/oauth/google/callback`.

### Luồng

1. `GET /api/auth/oauth/google/start?redirect_to=…` — sinh `state` + code
   verifier, ghi vào `UserOAuthState`, đặt cookie `httpOnly` ràng buộc `state`,
   rồi `302` sang `accounts.google.com`.
2. Google trả về `GET /api/auth/oauth/google/callback?code&state`.
3. BE so khớp `?state=` với cookie bằng `timingSafeEqual` **trước khi** ăn
   `state` (chống login CSRF), ăn `state` một lần rồi xoá, đổi code lấy token,
   đọc `userinfo`.
4. `linkOrCreateFromGoogle` quyết định xem làm gì với profile đó — xem bảng dưới.
5. Cấp cookie phiên rồi `302` về **trang chủ** (`/`).

### Bốn nhánh sau khi có profile Google

| Điều kiện | Kết cục | Người dùng thấy |
| --- | --- | --- |
| `sub` đã gắn với đúng user đang đăng nhập, hoặc không có ai đăng nhập | `ok` | Vào thẳng app |
| `sub` đã gắn với **user khác** | `conflict` | `?oauth=conflict` — phải đăng xuất rồi thử lại |
| Email đã có tài khoản, người dùng **chưa** đăng nhập | `needs-password` | `?oauth=exists` — đăng nhập bằng mật khẩu |
| Google chưa xác minh email | `unverified` | `?oauth=unverified` |

Nhánh `needs-password` là **ranh giới bảo mật**: không tự ghép tài khoản theo
email, vì kẻ nào đăng ký Google với email của bạn cũng vào được tài khoản bạn.
Ghép **tự động** vẫn xảy ra, nhưng chỉ khi người dùng đã đăng nhập bằng mật
khẩu và bấm Google — khi đó `byEmail.id === signedInUserId` nên BE tự nối
`UserAccount` và trả `ok`, tức lần sau vào thẳng bằng Google.

## Deploy (Vercel)

- FE, Admin, BE là 3 project Vercel riêng (BE chạy qua `be/api/index.ts`).
- Env bắt buộc trên BE: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JUDGE0_URL`, `JUDGE0_API_TOKEN`,
  `ADMIN_*`, `FRONTEND_URL`, `FRONTEND_ADMIN_URL`, `EMAIL_*` (hoặc `MAIL_API_TOKEN`),
  và `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` (bỏ trống
  thì nút Google báo lỗi cấu hình; xem mục OAuth ở trên).
- Stripe webhook trỏ tới `https://<be>/api/premium/webhook`.

## Bảo mật Judge0 (VM riêng)

Judge0 CE hỗ trợ auth native trong `judge0.conf` — không cần nginx:

```ini
AUTHN_TOKEN=<token-mạnh>
```

```bash
docker compose up -d   # restart để nhận config
```

BE tự gửi header `X-Auth-Token: $JUDGE0_API_TOKEN` mọi request (đặt cùng token ở env BE).
Có thể siết thêm: `MAX_QUEUE_SIZE=50` cho VM yếu. Chi tiết: `be/README.md`.

## API chính

| Method & Path | Auth | Mô tả |
| --- | ---- | ----- |
| `GET /api/problems` | public | Danh sách đề đã duyệt |
| `GET /api/problems/:slug` | public | Chi tiết đề (ẩn test ẩn) |
| `POST /api/problems/:slug/submit` | JWT cookie | Chấm test ẩn, lưu lịch sử + đã giải |
| `POST /api/submissions/batch` | JWT cookie | Gửi batch lên Judge0 |
| `GET /api/submissions/batch?tokens=` | JWT cookie | Poll kết quả |
| `GET/POST /api/history` | JWT cookie | Lịch sử nộp bài |
| `GET /api/progress/solved`, `/favorites` | JWT cookie | Tiến độ user |
| `POST /api/premium/checkout`, `/webhook` | JWT cookie / Stripe | Thanh toán |
| `POST /api/qna` | public (throttle) | Gửi câu hỏi |
| `POST /api/admin/login` | admin | Đăng nhập admin (throttle 5/phút) |

## Scripts BE (`be/scripts/`)

- `seed-problems.ts` — upsert 56 đề từ `FE/app/data/problems.ts`
- `keep20.ts`, `cleanup-numbered.ts` — dọn đề rác (chạy thủ công, kiểm tra kỹ trước khi dùng)

## Tech stack

FE: Next.js 16, React 19, TypeScript, Tailwind v4, shadcn, SWR, R3F, Framer Motion,
GSAP, Monaco • BE: NestJS 12, Prisma 7, Neon Postgres, Stripe, Nodemailer/Mailtrap •
Infra: Vercel, pnpm, Judge0 Docker

