# GoCode — Algorithm Practice Platform (coding-dev-lab)

A Vietnamese-language algorithm practice platform for students. Users read problem statements, write code in a Monaco editor, submit solutions, and receive instant judging results from Judge0. The platform gamifies learning with streaks, heatmaps, and badges, and monetizes via a Premium/VIP subscription tier (Stripe).

**Production URL:** [https://go-code-vn.vercel.app/](https://go-code-vn.vercel.app/)

---

## Features

### Core Platform
- **Problem Library** — Browse and search algorithm problems across 8 topics (Arrays & Pointers, Strings, Linked Lists, Stack & Queue, Trees & Graphs, Dynamic Programming, Sorting & Searching, Hashing & Sets)
- **Code Editor** — Monaco Editor with syntax highlighting for multiple languages
- **Instant Judging** — Submit code and get real-time results from Judge0 (CPU 2s, RAM 128MB limits)
- **Batch Testing** — Submit up to 10 hidden tests at once with fail-fast polling
- **Submission History** — Track your last 50 submissions per problem

### Gamification
- **Streak System** — Consecutive days with activity (Vietnam timezone UTC+7)
- **Activity Heatmap** — 35-day activity visualization
- **12 Badges** — Unlocked by streak length, problems solved, and difficulty milestones
- **Solved & Favorites** — Server-side storage, synced across devices

### Authentication
- **Email/Password** — Registration with email verification (24-hour token)
- **Google OAuth 2.0** — PKCE S256 flow with state stored hashed in DB
- **JWT RS256** — Access tokens (15-min expiry) + Refresh tokens (30-day, per-device rotation, max 10 sessions)
- **Password Reset** — Token-based via email (1-hour expiry)
- **Timing Attack Prevention** — Dummy bcrypt hash comparison for non-existent users

### Premium/VIP
- **3 Plans** — 200 VND/day, 1,000 VND/month, 2,000 VND/year
- **Stripe Checkout** — Subscription mode with VND currency
- **Webhook Idempotency** — Duplicate event prevention via `StripeEvent` table
- **Auto-Downgrade** — VIP expires automatically; sweep runs every 60 minutes
- **VIP-Only Problems** — Per-problem VIP flag for exclusive content

### Admin Dashboard
- **Analytics** — 30-day stats, online count, daily charts, top problems, recent logins by country
- **User Management** — List, search by email/name/ID
- **Problem Management** — CRUD, publish/unpublish, VIP flag toggle
- **Submission Review** — View all submissions with source code
- **Q&A Management** — Read questions, reply via email (Brevo SMTP)

### Q&A Support
- **Public Submission** — Guests can submit questions (rate limited: 5/minute)
- **Admin Reply** — Sends email via Brevo SMTP with HTML template

### Analytics & Presence
- **Page View Tracking** — Fire-and-forget, IP hashed with salt (privacy-preserving)
- **Login Analytics** — Country detection via Vercel header or ip-api.com
- **Online Presence** — In-memory heartbeat with 45-second TTL

---

## Tech Stack

### Backend (`be/`)
| Technology | Purpose |
|------------|---------|
| NestJS 12 (ESM) | REST API framework |
| Prisma 7 | ORM with PostgreSQL |
| PostgreSQL | Database |
| jose / jsonwebtoken | JWT (RS256) authentication |
| bcryptjs | Password hashing |
| Judge0 (self-hosted) | Code execution engine |
| Stripe 18 | Payment processing |
| Nodemailer 10 | Email (Brevo SMTP) |
| class-validator | Input validation |
| Vitest 4 + Supertest | Testing |
| oxlint | Linting |

### Frontend (`FE/`)
| Technology | Purpose |
|------------|---------|
| Next.js 16.3 (App Router) | React framework |
| React 19.2 | UI library |
| Monaco Editor | Code editor |
| Three.js + @react-three/fiber | 3D graphics |
| Framer Motion 13 + GSAP 3 | Animations |
| shadcn/ui + Tailwind CSS 4 | UI components |
| SWR 2 | Data fetching |
| Vitest 5 | Testing |

### Admin (`admin/`)
| Technology | Purpose |
|------------|---------|
| Next.js 16.3 (App Router) | Admin dashboard framework |
| React 19.2 | UI library |
| shadcn/ui + Tailwind CSS 4 | UI components |
| jose | JWT verification |
| SWR 2 | Data fetching |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| pnpm 10.15 | Package manager (workspace) |
| Vercel | Deployment (3 separate projects) |
| Neon Postgres | Serverless database |
| Docker | Judge0 self-hosting |
| Playwright 16 | E2E testing |
| k6 | Performance testing |

---

## Prerequisites

- Node.js 18+
- pnpm 10+
- PostgreSQL 14+
- Docker (for Judge0)
- Stripe account (for payments)
- Brevo account (for email)

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/longdrache/coding-dev-lab.git
cd coding-dev-lab
```

### 2. Install Dependencies

```bash
pnpm --dir be install
pnpm --dir FE install
pnpm --dir admin install
```

### 3. Configure Environment Variables

```bash
cp be/.env.example be/.env
cp FE/.env.example FE/.env
cp admin/.env.example admin/.env
```

Edit each `.env` file with your configuration. See the [Environment Variables](#environment-variables) section below.

### 4. Start Infrastructure (PostgreSQL + Judge0)

```bash
cd be
docker compose up -d
```

### 5. Run Database Migrations & Seed

```bash
pnpm --dir be exec prisma migrate deploy
pnpm --dir be exec node scripts/seed-problems.ts
```

### 6. Start Development Servers

```bash
# Backend + Frontend
pnpm dev

# Backend + Frontend + Admin
pnpm dev-admin
```

The apps will be available at:
- **Frontend:** http://localhost:3000
- **Admin:** http://localhost:3001
- **Backend API:** http://localhost:4000

---

## Environment Variables

### Backend (`be/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 4000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string (pooled) |
| `DATABASE_URL_UNPOOLED` | No | Direct connection (bypasses Neon pooler) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signature verification |
| `FRONTEND_URL` | Yes | Frontend origin for CORS and email links |
| `JUDGE0_URL` | Yes | Judge0 URL (default: `http://judge0-server:2358`) |
| `JUDGE0_API_TOKEN` | Yes | Auth token for Judge0 reverse proxy |
| `USER_LOGIN` / `USER_PASS` / `MAIL_FROM` | No | Brevo SMTP credentials |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` | Yes | Admin login credentials |
| `ADMIN_JWT_PRIVATE_KEY` / `ADMIN_JWT_PUBLIC_KEY` | Yes | RSA key pair for admin JWT (RS256) |
| `JWT_SECRET` | No | Legacy HS256 fallback |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Yes | Google OAuth credentials |
| `IP_HASH_SALT` | No | Salt for IP hashing (privacy) |
| `DISABLE_RATE_LIMIT` | No | Set to `1` to disable rate limiting |
| `DISABLE_OAUTH_STATE_SWEEP` | No | Set to `1` to disable OAuth state cleanup |
| `DISABLE_PREMIUM_SWEEP` | No | Set to `1` to disable VIP expiry sweep |

### Frontend (`FE/.env`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `http://localhost:4000`) |
| `NEXT_PUBLIC_CHECKOUT_HOSTS` | Trusted payment hostnames (comma-separated) |

### Admin (`admin/.env`)

| Variable | Description |
|----------|-------------|
| `BE_API_URL` | Backend URL for BFF proxy (server-side) |
| `NEXT_PUBLIC_API_URL` | Fallback when `BE_API_URL` is missing |
| `JWT_SECRET` | HS256 fallback (dev only) |
| `ADMIN_JWT_PUBLIC_KEY` | RSA public key for admin cookie verification |

---

## Project Structure

```
coding-dev-lab/
├── package.json              # Root orchestration (concurrently)
├── pnpm-lock.yaml
├── playwright.config.ts      # E2E test config
├── README.md                 # This file
├── PRODUCT.md                # Product requirements
├── DESIGN.md                 # Design system
├── PRIVACY.md                # Privacy policy
├── DEFEND.md                 # Security documentation
├── docs/                     # Images, specs, reports
├── .github/                  # CI/CD workflows
│
├── be/                       # Backend (NestJS)
│   ├── package.json
│   ├── .env.example
│   ├── prisma/
│   │   └── schema.prisma     # 15 database models
│   ├── src/
│   │   ├── main.ts           # Bootstrap (ESM, dotenv, CORS)
│   │   ├── app.module.ts     # Root module
│   │   ├── auth/             # Authentication (JWT, OAuth, tokens)
│   │   ├── judge0/           # Code execution service
│   │   ├── problems/         # Problem management + VIP policy
│   │   ├── submissions/      # Submission history
│   │   ├── progress/         # Streaks, badges, heatmap
│   │   ├── premium/          # Stripe payments + VIP
│   │   ├── admin/            # Admin panel API
│   │   ├── qna/              # Q&A support
│   │   ├── views/            # Page view analytics
│   │   ├── presence/         # Online user tracking
│   │   ├── activity/         # Daily activity tracking
│   │   ├── database/         # Prisma database service
│   │   └── common/           # Throttle guard, cache config
│   ├── tests/performance/    # k6 load tests
│   └── scripts/              # Seed scripts, E2E guards
│
├── FE/                       # Frontend (Next.js 16)
│   ├── package.json
│   ├── .env.example
│   ├── app/                  # App Router pages
│   │   ├── page.tsx          # Home
│   │   ├── problem/[slug]/   # Problem detail + editor
│   │   ├── premium/          # Premium plans
│   │   ├── sign-in/          # Login
│   │   ├── sign-up/          # Register
│   │   └── ...
│   ├── components/           # React components
│   ├── lib/                  # Utilities
│   └── public/               # Static assets
│
├── admin/                    # Admin Dashboard (Next.js 16)
│   ├── package.json
│   ├── .env.example
│   ├── app/                  # App Router pages
│   │   └── api/[...path]/    # BFF proxy to backend
│   ├── components/           # Admin UI components
│   ├── lib/                  # Utilities
│   └── proxy.ts              # BFF proxy with JWT verification
│
└── e2e/                      # Playwright E2E tests
    ├── smoke.spec.ts
    ├── account-menu.spec.ts
    ├── header-wrap.spec.ts
    └── vip-problems.spec.ts
```

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | Public | Register (20/hr limit) |
| POST | `/login` | Public | Login (30/15min limit) |
| POST | `/refresh` | Cookie | Refresh session (100/min) |
| POST | `/logout` | Cookie | Logout current device |
| POST | `/logout-all` | JWT | Logout all devices |
| POST | `/forgot-password` | Public | Request reset (20/hr) |
| POST | `/resend-verification` | Public | Resend verification (20/hr) |
| POST | `/reset-password` | Public | Reset with token (20/hr) |
| GET | `/verify?token=` | Public | Verify email (20/min) |
| GET | `/me` | JWT | Current user |
| GET | `/oauth/google/start` | Public | Start Google OAuth (20/hr) |
| GET | `/oauth/google/callback` | Public | Google OAuth callback (20/hr) |

### Problems (`/api/problems`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Optional | List published problems |
| GET | `/:slug` | Optional | Problem detail (VIP-gated) |
| POST | `/:slug/submit` | JWT | Submit solution (10/min) |

### Submissions (`/api/submissions`, `/api/history`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/submissions` | JWT | Single submission (20/min) |
| POST | `/api/submissions/batch` | JWT | Batch submit (20/min) |
| GET | `/api/submissions/batch?tokens=` | JWT | Poll batch (100/min) |
| GET | `/api/submissions/:token` | JWT | Get submission result |
| GET | `/api/history` | JWT | User submission history |
| POST | `/api/history` | JWT | Create submission record (30/min) |

### Progress (`/api/progress`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/dashboard` | JWT | Streak, heatmap, badges, solved |
| GET | `/solved` | JWT | Solved problems |
| GET | `/badges` | JWT | Badge list |
| POST | `/solve` | JWT | Mark problem solved |
| GET | `/favorites` | JWT | Favorite problems |
| POST | `/favorites` | JWT | Add favorite |
| DELETE | `/favorites/:slug` | JWT | Remove favorite |

### Premium (`/api/premium`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/checkout` | JWT | Create Stripe checkout |
| GET | `/status` | JWT | VIP status |
| POST | `/grant-vip` | Admin | Grant VIP to user |
| POST | `/cancel-vip` | Admin | Cancel VIP |
| POST | `/webhook` | Stripe | Stripe webhook |
| POST | `/check-expired` | JWT | Check/downgrade expired VIP |

### Admin (`/api/admin`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/login` | Public | Admin login (5/min) |
| POST | `/refresh` | Cookie | Refresh admin token (100/min) |
| POST | `/logout` | Cookie | Admin logout |
| GET | `/me` | Admin | Current admin |
| GET | `/stats` | Admin | Dashboard stats |
| GET | `/analytics/views` | Admin | View analytics |
| GET | `/analytics/views/recent` | Admin | Recent views |
| GET | `/analytics/logins` | Admin | Login analytics |
| GET | `/qna` | Admin | List Q&A |
| DELETE | `/qna/:id` | Admin | Delete Q&A |
| POST | `/qna/:id/reply` | Admin | Reply via email |
| GET | `/users` | Admin | List users |
| GET | `/submissions` | Admin | List submissions |
| GET | `/problems` | Admin | List all problems |
| GET | `/problems/:slug` | Admin | Problem detail |
| POST | `/problems` | Admin | Create problem |
| PUT | `/problems/:slug` | Admin | Update problem |
| DELETE | `/problems/:slug` | Admin | Delete problem |
| POST | `/problems/:slug/approve` | Admin | Publish problem |
| POST | `/problems/:slug/unpublish` | Admin | Unpublish problem |
| PATCH | `/problems/:slug/vip` | Admin | Toggle VIP flag |

### Other

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/presence/online` | Public | Online count |
| POST | `/api/presence/heartbeat` | Public | Heartbeat |
| POST | `/api/views/track` | Public | Track page view (30/min) |
| POST | `/api/qna` | Public | Submit question (5/min) |
| POST | `/api/activity/login` | JWT | Record login |
| POST | `/api/activity/run` | JWT | Record run |
| GET | `/api/activity/me` | JWT | Activity map |

---

## Database Schema

15 models in `be/prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `User` | User accounts (email, role, VIP status, Stripe subscription) |
| `UserToken` | Refresh/verification tokens (hashed, with rotation) |
| `UserAccount` | OAuth provider links |
| `UserOAuthState` | OAuth state (PKCE) |
| `ActivityDay` | Daily activity counts for streaks |
| `SolvedProblem` | Solved problems per user |
| `FavoriteProblem` | Favorite problems per user |
| `UserBadge` | Unlocked badges |
| `Problem` | Problem definitions (slug, title, difficulty, topic, tests, VIP flag) |
| `Submission` | Submission history (source code, status, results) |
| `QnaQuestion` | Q&A questions |
| `StripeEvent` | Stripe webhook events (idempotency) |
| `PageView` | Page view analytics (IP hashed) |
| `LoginEvent` | Login analytics (IP hashed) |

---

## Testing

- **Unit Tests:** 744 Vitest tests (86.5% line coverage)
- **E2E Tests:** 13 Playwright tests
- **Performance Tests:** 2 k6 load test scenarios

```bash
# Run unit tests
pnpm --dir be test
pnpm --dir FE test

# Run E2E tests
pnpm test:e2e
```

---

## Security

- RS256 JWT for authentication
- bcrypt password hashing
- Timing-safe comparisons (dummy bcrypt for non-existent users)
- Rate limiting (per-IP, per-route)
- Input validation with `whitelist` mode
- No raw IP storage (only salted SHA-256 hashes)
- Hidden tests never sent to client
- OAuth state stored hashed with PKCE S256

---

## Performance

- p95 < 500ms for public reads
- ~2ms p95 for cached reads
- Judge0 submit p95 ~1s

---

## Deployment

The app is deployed on Vercel as 3 separate projects:
- **Frontend:** [https://go-code-vn.vercel.app/](https://go-code-vn.vercel.app/)
- **Admin:** Separate Vercel deployment
- **Backend:** Separate Vercel deployment

Infrastructure:
- **Database:** Neon Postgres (serverless, pooler + direct connection)
- **Judge0:** Self-hosted on Oracle Cloud VM (free tier)

---

## Contributing

This is a personal project. Contributions are not expected, but feel free to fork and learn from the code.

---

## License

This project is for educational purposes. No license is specified.
