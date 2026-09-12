# 🧪 coding-dev-lab

Chào mừng bạn đến với **coding-dev-lab**! 

Đây là "phòng thí nghiệm" lập trình web cá nhân — nơi mình dùng để thử nghiệm các ý tưởng mới, luyện tập kỹ năng, lưu trữ các đoạn code hay (snippets) và xây dựng các dự án web nhỏ.

---

## 📌 Mục đích của Repository
- 🚀 **Thử nghiệm công nghệ:** Test các framework, thư viện hoặc tính năng web mới.
- 📚 **Lưu trữ kiến thức:** Gom các đoạn code mẫu, mẹo tối ưu và xử lý lỗi phổ biến.
- 🛠️ **Dự án thực hành:** Xây dựng các giao diện (UI) và ứng dụng web nhỏ (mini-apps).

---

## 🧰 Công nghệ sử dụng
- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Backend:** NestJS, TypeScript
- **Code execution:** Judge0
- **Package manager:** pnpm
- **CI:** GitHub Actions

## 📂 Cấu trúc thư mục
```text
coding-dev-lab/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI cho frontend và backend
├── FE/                         # Ứng dụng frontend Next.js
│   ├── app/
│   │   ├── globals.css         # CSS toàn cục
│   │   ├── layout.tsx          # Root layout và metadata
│   │   └── page.tsx            # Giao diện chạy code
│   ├── public/                 # Tài nguyên tĩnh
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── eslint.config.mjs
├── be/                         # API backend NestJS
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   ├── judge0.controller.ts # API /api/submissions
│   │   └── judge0.service.ts    # Proxy tới Judge0
│   ├── test/                   # E2E tests
│   ├── docker-compose.yml      # Judge0 server và workers
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   └── vitest.config.ts
├── LICENSE
└── README.md
```

## 🔄 CI/CD

Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) chạy trên mỗi push vào `main`/`master` và mỗi Pull Request. CI kiểm tra lint, typecheck, test và build cho cả frontend và backend.

## ▶️ Chạy local

### Clerk authentication

Create a Clerk application, then configure these environment variables:

```env
# FE/.env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_API_URL=http://localhost:4000

# be/.env
CLERK_SECRET_KEY=sk_test_...
CLERK_AUTHORIZED_PARTIES=http://localhost:3000
```

The backend needs its own `CLERK_SECRET_KEY`; the frontend publishable key
cannot verify tokens. Copy the secret from the Clerk Dashboard into `be/.env`
and restart the backend after changing it.

The frontend sends the Clerk session token as a Bearer token. The backend
verifies its signature and protects `/api/submissions`. Authenticated users
default to the `user` role. To enable VIP or admin routes, add a `role` claim to the
Clerk Session Token template, for example:

```json
{
	"role": "{{user.public_metadata.role}}"
}
```

Set `publicMetadata.role` to `vip` after a successful upgrade, or `admin` for
administrators. The example `GET /api/vip/health` endpoint accepts `vip` and
`admin`; `GET /api/admin/health` still requires `admin`.

Do not let the browser set its own role. A payment webhook or admin-only
backend action must update Clerk `publicMetadata.role` after payment
verification, then the user must refresh their Clerk session token.

### Backend

```bash
cd be
pnpm install
pnpm start:dev
```

Backend mặc định chạy tại `http://localhost:3000`. Có thể cấu hình địa chỉ Judge0 bằng biến môi trường `JUDGE0_URL`.

### Frontend

```bash
cd FE
pnpm install
pnpm dev
```

Frontend mặc định chạy tại `http://localhost:3000`. Nếu backend chạy ở cổng khác, đặt `NEXT_PUBLIC_API_URL`, ví dụ `http://localhost:3001`.

For a production or CI build, configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
in the deployment environment. The `FE/.env` file is intentionally ignored
by Git and is only for local development. If deploying on Vercel, set the
frontend project root to `FE` and add the variable under Project Settings,
then redeploy.
