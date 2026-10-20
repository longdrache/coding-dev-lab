# FE → BE → RAG

- Ngày: 2026-10-20
- Trạng thái: đã duyệt thiết kế, chờ review spec

## Mục tiêu

Cho học viên hỏi trợ lý AI ngay trong trang bài tập, và cho admin nhập tài liệu
vào bot RAG. Mọi lời gọi bot đi qua BE để giữ `ADMIN_KEY` ở server, áp auth,
rate limit và timeout tại một chỗ.

```
FE (trang bài tập) --cookie session--> BE POST /api/rag/chat      --> bot POST /chat
Admin (trang RAG)  --Bearer admin_token--> BE POST /api/admin/rag/ingest --> bot POST /ingest
```

## Hợp đồng với bot (tạm thời)

Bot hiện chỉ có `/ingest`; `/chat` chưa tồn tại. BE định nghĩa trước hợp đồng
dưới đây và sẽ chỉnh khi bot có spec thật.

| | Chat | Ingest |
|---|---|---|
| Method/path | `POST ${BOT_URL}/chat` | `POST ${BOT_URL}/ingest` |
| Auth | `Authorization: Bearer ${ADMIN_KEY}` | như chat |
| Body | `{ message, history, context: { problemSlug } }` | `{ source, text }` |
| Phản hồi mong đợi | JSON `{ answer }`, hoặc text thô | text/JSON tuỳ bot |
| Timeout | 30s | 60s |

Quy ước trích `answer`: nếu JSON có `answer`, dùng nó; nếu không, thử `reply`,
`message`, `response`; cuối cùng dùng nguyên text. Không có nội dung → 502.

## BE

Thư mục mới `be/src/rag/`:

- `rag.module.ts` — khai báo `RagBotClient`, `RagService`, `RagController`; export
  `RagBotClient` cho admin dùng.
- `rag.bot-client.ts` — đọc `BOT_URL`, `ADMIN_KEY` qua `ConfigService`; một hàm
  `post(path, body, timeoutMs)` dùng `fetch` + `AbortSignal.timeout`; map lỗi
  mạng/timeout thành `BadGatewayException`, thiếu cấu hình thành
  `ServiceUnavailableException`.
- `rag.service.ts` — validate + chuẩn hoá đầu vào, gọi bot, trích `answer`.
- `rag.controller.ts` — `@Controller('api/rag')`, `POST chat`.

Endpoint chat:

- `@UseGuards(AuthGuard)` — bắt buộc đăng nhập (cookie `session`/Bearer).
- `@Throttle({ default: { limit: 10, ttl: 60_000 } })` — 10 request/phút/IP
  (giới hạn hiện có của `ThrottleGuard` tính theo IP).
- Body `{ message, history?, problemSlug? }`:
  - `message`: trim, bắt buộc, ≤ 2000 ký tự.
  - `history`: mảng ≤ 10 phần tử; mỗi phần tử `{ role: 'user' | 'assistant',
    content: string }`, `content` ≤ 2000 ký tự; phần tử sai bị bỏ.
  - `problemSlug`: tuỳ chọn, chỉ nhận `[a-z0-9-]`, ≤ 120 ký tự.
- Trả `{ answer: string }`.

Endpoint ingest (trong `AdminModule`, không nằm trong Swagger public):

- File mới `be/src/admin/admin-rag.controller.ts`,
  `@Controller('api/admin/rag')`, `POST ingest`, `@UseGuards(AdminGuard)`.
- Body `{ source, text }`: `source` trim ≤ 120; `text` không rỗng, ≤ 5MB UTF-8.
- Gọi `RagBotClient.post('/ingest', …)`, trả `{ ok: true }`; lỗi bot → 502.

Đăng ký `RagModule` trong `app.module.ts` và thêm vào `PUBLIC_API_MODULES`
(chat là API public có auth; ingest nằm ở `AdminModule` nên không lộ docs).

`be/.env.example` thêm:

```
# Bot RAG (server-to-server)
BOT_URL=http://localhost:8000
ADMIN_KEY=replace-me
```

## Admin

Trang nhập tài liệu đã có (`app/(dashboard)/rag/page.tsx`) chuyển sang gọi
`/api/admin/rag/ingest`. BFF catch-all `app/api/[...path]/route.ts` đã forward
`admin_token` thành Bearer, nên không cần route riêng.

Xoá phần vừa thêm nhưng không còn cần:

- `admin/app/api/rag/ingest/route.ts`
- `admin/lib/rag-ingest.ts`, `admin/lib/admin-auth-server.ts`
- `admin/rag-ingest.test.mjs` và dòng tương ứng trong script `test`
- `BOT_URL`, `ADMIN_KEY` khỏi `admin/.env.example`

## FE

Component mới `FE/components/ProblemAssistant.tsx` (client):

- Chỉ render nội dung khi `useSession()` có user; chưa đăng nhập thì hiện lời
  nhắc đăng nhập, không gọi API.
- Panel thu gọn/mở được, đặt trong trang bài tập.
- Lịch sử hội thoại chỉ trong state của component (mất khi reload), gửi kèm
  tối đa 10 lượt gần nhất.
- Gọi `POST ${API_URL}/api/rag/chat` với `credentials: "include"`, body
  `{ message, history, problemSlug }`.
- Trạng thái: đang chờ (disable input, spinner), lỗi 401/429/502 hiển thị thân
  thiện, Enter gửi / Shift+Enter xuống dòng, tự cuộn xuống tin mới.

Chèn `<ProblemAssistant slug={...} />` vào `FE/app/problem/[slug]/page.tsx` ở
cột trái dưới phần đề bài.

## Bảo mật

- `ADMIN_KEY` chỉ tồn tại trong env của BE, không có tiền tố `NEXT_PUBLIC`.
- Chat bắt buộc session; giới hạn 10/phút/IP; message/history bị chặn kích thước
  để tránh lạm dụng chi phí.
- Không log nội dung message/history.
- Ingest chỉ admin (`AdminGuard`, role `admin`, từ chối refresh token).

## Kiểm thử

- BE (vitest): validate `message`/`history`/`problemSlug`; trích `answer` từ JSON
  và text; map timeout/mất kết nối thành 502; thiếu env thành 503; ingest từ
  chối body rỗng/quá lớn. Mock `global.fetch`.
- FE (vitest): helper cắt history còn 10 lượt và bỏ phần tử sai.
- Admin: chạy lại test hiện có sau khi xoá file.
- Kiểm chứng thủ công: `pnpm test`, `tsc --noEmit`, `pnpm lint`, `pnpm build`
  cho `be/`, `FE/`, `admin/`.

## Ngoài phạm vi

- Streaming câu trả lời.
- Lưu lịch sử chat vào DB.
- Hiểu ngữ cảnh bài tập ở phía bot (BE chỉ chuyển `problemSlug`).
- Chỉnh sửa `/chat` khi bot có hợp đồng thật.

## Rủi ro

- `/chat` chưa tồn tại → chat trả 502 cho tới khi bot triển khai. Cần thống nhất
  hợp đồng trước khi phát hành.
- `ThrottleGuard` giới hạn theo IP, không theo user; nhiều học viên chung NAT có
  thể chạm trần. Chấp nhận ở v1.
