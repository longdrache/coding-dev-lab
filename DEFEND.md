# GoCode — Defend Notes

## Security

### Authentication
- **Access token**: JWT RS256, 15 phút, lưu cookie `httpOnly` + `Secure` + `SameSite=None`
- **Refresh token**: 30 ngày, xoay vòng theo thiết bị, lưu hash trong DB (`UserToken`)
- **Thu hồi**: logout xoá dòng `UserToken` → refresh token cũ không dùng được
- **Đa thiết bị**: mỗi thiết bị 1 dòng `UserToken`, đăng nhập mới không đuổi thiết bị cũ

### Authorization
- **Role**: `user` / `vip` / `admin` lưu trong DB (`User.role`), ký trong JWT
- **VIP gating**: `canAccessVipProblems(role)` — chỉ `vip`/`admin` đọc được bài VIP
- **Admin**: cặp RS256 riêng, cookie `SameSite=None; Secure` khi production

### Rate Limiting
- **Global**: `express-rate-limit` 1000 req/min/IP (tăng từ 100 để test 30 VUs)
- **Per-route**: `ThrottleGuard` — login 1/15phút, register 20/giờ, submit 30/phút
- **Key**: `${ip}:${ClassName}:${handlerName}` — chống spam theo route

### Input Validation
- `ValidationPipe` với `whitelist: true` — chặn field không khai báo
- `forbidNonWhitelisted` cho route nhạy cảm (VIP toggle)
- Sanitize output: ẩn `hiddenTests` khỏi mọi response

### Data Protection
- **IP hash**: `sha256(salt + IP)` — không lưu IP thô
- **Password**: bcrypt
- **SQL injection**: Prisma ORM (parameterized queries)
- **XSS**: React escape output, `httpOnly` cookie

---

## Stripe

### Checkout Flow
1. FE gọi `POST /api/premium/checkout` với `{ plan }`
2. BE tạo Checkout Session với `metadata: { userId, plan }`
3. Stripe redirect về `success_url` / `cancel_url`

### Webhook Idempotency
- **Vấn đề**: Stripe retry event khi timeout → gia hạn VIP hai lần
- **Giải pháp**: bảng `StripeEvent` với `eventId` là PK
- **Cơ chế**: `stripeEvent.create()` → P2002 unique violation → bỏ qua event trùng
- **Code**: `be/src/premium/premium.service.ts:294`

### VIP Lifecycle
- **Cấp VIP**: `checkout.session.completed` → `setUserToVip(userId, plan)`
- **Hạ VIP**: `customer.subscription.deleted` → `removeVip(userId)`
- **Hết hạn**: `checkAndDowngradeIfExpired()` gọi trong auth flow

### Test
- **Test card**: `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline)
- **Local**: `stripe listen --forward-to localhost:4000/api/premium/webhook`

---

## Judge0

### Sandbox Security
- **Container**: mỗi submission 1 container tạm, xong xóa
- **Resource limits**: CPU 2s, RAM 128MB, pids limit
- **Network isolation**: container không có network access
- **Read-only FS**: không ghi được ra host
- **Non-root**: process chạy với quyền thấp
- **Timeout**: kill process nếu vượt CPU time limit

### Auth
- **Header**: `X-Auth-Token: $JUDGE0_API_TOKEN`
- **Config**: `AUTHN_TOKEN` trong `judge0.conf`
- **Public mode**: bỏ token = ai cũng chấm được (chỉ dev)

### Batch Submission
- **Limit**: 10 submissions/batch
- **Poll**: `GET /api/submissions/batch?tokens=...`
- **Status**: queued → processing → accepted/wrong answer/runtime error

---

## k6 Performance Testing

### Metrics (30 VUs, 120s, 3 runs)
| Metric | Value |
|--------|-------|
| RPS | 19.67 |
| p50 | 1.02ms |
| p90 | 1.68ms |
| p95 | 2.12ms |
| p99 | 800ms |
| Error rate | 0% |

### Judge0 Test (5 VUs, 60s)
| Metric | Value |
|--------|-------|
| RPS | 4.41 |
| p50 | 202ms |
| p95 | 1.03s |
| p99 | 1.62s |
| Error rate | 0% |

### Script Path
- `be/tests/performance/problems-load-test.js`
- `be/tests/performance/judge0-load-test.js`

### Reproduce
```bash
cd be && pnpm start:dev
k6 run --vus 30 --duration 120s --summary-trend-stats "avg,min,med,max,p(90),p(95),p(99)" -e BASE_URL=http://localhost:4000 tests/performance/problems-load-test.js
```

---

## Testing

### Unit/Integration (Vitest)
- **744 tests** passing
- **Coverage**: 86.5% lines, 84.5% statements, 83.7% functions, 75.8% branches
- **Thresholds**: lines ≥ 80%, branches ≥ 75%
- **Run**: `pnpm --dir be test`

### E2E (Playwright)
- **13 tests** — landing, sign-in, sign-up, problem list, premium, 404
- **Run**: `pnpm test:e2e`

### Test Strategy
- **Service layer**: mock DB, test business logic
- **Controller layer**: test validation, auth guard
- **Cache layer**: test TTL, invalidation, VIP redaction
- **E2E**: test critical user flows

### Coverage Exclude
- `**/*.spec.ts` — test files
- `src/generated/**` — Prisma client
- `src/main.ts` — entry point
