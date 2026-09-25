# GoCode — Nền tảng luyện thuật toán

Hệ thống chấm code tự động: 56 bài tập từ Dễ đến Khó, 8 ngôn ngữ, chấm batch realtime,
streak/heatmap, gói Premium (Stripe), trang quản trị riêng.

**Demo:** FE + Admin + BE deploy trên Vercel • DB Neon (Postgres) • Judge0 self-hosted

## Kiến trúc

```
┌─────────┐  ┌─────────┐
│   FE    │  │  Admin  │   Next.js 16 + React 19 (Clerk auth / JWT cookie)
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
         ▼                             │ Clerk    │  auth user
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
- **Bảo mật**: Clerk JWT, admin RS256 riêng, throttle (login/QNA 5, submit 10/phút), validate mọi input, Judge0 có token

## Chạy local

Yêu cầu: Node 20+, pnpm 10, Judge0 (Docker) hoặc dùng Judge0 sẵn có.

```bash
# 1. Cài đặt
pnpm --dir be install && pnpm --dir FE install && pnpm --dir admin install

# 2. Env: copy be/.env.example, FE/.env.example, admin/.env.example thành .env
#    Điền: DATABASE_URL (Neon), CLERK_*, STRIPE_*, JUDGE0_URL, JUDGE0_API_TOKEN,
#    ADMIN_EMAIL, ADMIN_PASSWORD_HASH, ADMIN_JWT_PRIVATE_KEY / PUBLIC_KEY, CRON_SECRET

# 3. Đẩy schema + seed 56 đề
pnpm --dir be prisma db push
pnpm --dir be exec tsx scripts/seed-problems.ts

# 4. Chạy (BE + FE, thêm admin khi cần)
pnpm dev            # BE :4000 + FE :3000
pnpm dev-admin      # + Admin :3001 (kèm BE, FE)
```

Tài khoản admin mặc định dev: `admin` / `admin` (đặt `ADMIN_PASSWORD_HASH` khi deploy).

## Deploy (Vercel)

- FE, Admin, BE là 3 project Vercel riêng (BE chạy qua `be/api/index.ts`).
- Env bắt buộc trên BE: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `CLERK_SECRET_KEY`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JUDGE0_URL`, `JUDGE0_API_TOKEN`,
  `ADMIN_*`, `CRON_SECRET`, `FRONTEND_URL`, `FRONTEND_ADMIN_URL`, `MAIL_API_TOKEN`.
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
| `POST /api/problems/:slug/submit` | Clerk | Chấm test ẩn, lưu lịch sử + đã giải |
| `POST /api/submissions/batch` | Clerk | Gửi batch lên Judge0 |
| `GET /api/submissions/batch?tokens=` | Clerk | Poll kết quả |
| `GET/POST /api/history` | Clerk | Lịch sử nộp bài |
| `GET /api/progress/solved`, `/favorites` | Clerk | Tiến độ user |
| `POST /api/premium/checkout`, `/webhook` | Clerk / Stripe | Thanh toán |
| `POST /api/qna` | public (throttle) | Gửi câu hỏi |
| `POST /api/admin/login` | admin | Đăng nhập admin (throttle 5/phút) |

## Scripts BE (`be/scripts/`)

- `seed-problems.ts` — upsert 56 đề từ `FE/app/data/problems.ts`
- `keep20.ts`, `cleanup-numbered.ts` — dọn đề rác (chạy thủ công, kiểm tra kỹ trước khi dùng)

## Tech stack

FE: Next.js 16, React 19, TypeScript, Tailwind v4, shadcn, Clerk, SWR, R3F, Framer Motion,
GSAP, Monaco • BE: NestJS 12, Prisma 7, Neon Postgres, Stripe, Nodemailer/Mailtrap •
Infra: Vercel, pnpm, Judge0 Docker

