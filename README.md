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
