# Bot RAG (Cloudflare Worker)

Xử lý `POST /chat` từ BE NestJS (`be/src/rag/rag.bot-client.ts`), trả lời câu hỏi học viên dựa trên `tailieu.txt`.

## Yêu cầu
- Wrangler + Cloudflare account có KV.

## Cài đặt
```bash
cd bot
npm install
```

## Tạo KV namespace
```bash
npx wrangler kv:namespace create "RAG_KB"
```
Sửa `wrangler.toml`: thay `REPLACE_WITH_KV_NAMESPACE_ID` và `REPLACE_WITH_KV_PREVIEW_ID` bằng ID bản in ra.

## Nạp tài liệu vào KV
```bash
npx wrangler kv:key put tailieu --path ../tailieu.txt --namespace-id <NAMESPACE_ID>
```
Hoặc nếu chưa có `tailieu.txt` ở repo root, sao chép nội dung vào KV thủ công qua dashboard Cloudflare.

## Chạy local
```bash
npx wrangler dev
```

## Triển khai
```bash
npx wrangler deploy
```

Sau khi deploy, set env BE: `BOT_URL=https://<worker>.<subdomain>.workers.dev/chat` và `ADMIN_KEY=<bất kỳ>` (gộp cùng giá trị vào cả Worker nếu muốn bảo vệ bằng header — hiện Worker chưa kiểm tra `Authorization`, có thể bổ sung sau).

## Hợp đồng API
- Request: `POST /chat`, JSON `{ message, history[], context: { problemSlug } }`.
- Response: `200 { answer: string }`. Khi chưa có KB, trả lời lỗi cấu hình thay vì 502 để FE hiển thị thân thiện.
