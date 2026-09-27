# Vercel Cron — quét VIP hết hạn

Cảnh báo này nằm cạnh `vercel.json` **vì `vercel.json` không chứa được comment**.
File đó được đọc bằng parser JSON nghiêm ngặt (`json-parse-better-errors`, xem
`packages/cli/src/util/read-json-file.ts` của Vercel CLI); thêm `//` sẽ khiến
`vc build` ném `CantParseJSONFile` và deploy fail với *"Invalid vercel.json file
provided"*. Nên đừng chuyển nội dung này vào trong file config.

## Cấu hình đang dùng

```json
"crons": [
  { "path": "/api/premium/sweep-expired", "schedule": "0 * * * *" }
]
```

## Vercel cron gọi route này thế nào

- Vercel gửi **GET** (không phải POST) tới đúng `path` khai báo. Khối `crons` chỉ
  cho phép khai báo `path` và `schedule` — không cấu hình được method, body hay
  header tuỳ biến. Vì vậy route `sweep-expired` có cả `@Get` lẫn `@Post`.
- Vercel tự gắn header `Authorization: Bearer $CRON_SECRET` khi biến môi trường
  `CRON_SECRET` được cấu hình trên project. Route chấp nhận **hai** đường:
  `Authorization: Bearer <CRON_SECRET>` (đường Vercel dùng) và `x-cron-secret`
  (đường cũ, giữ lại cho client hiện có). Cả hai đều fail-closed: thiếu secret,
  sai secret, hoặc `CRON_SECRET` chưa cấu hình → **401** và không quét gì cả.

## Cảnh báo gói Hobby — lịch dưới 1 lần/ngày làm HỎNG DEPLOY

Đây không phải chuyện "cron sẽ chạy ít hơn". Tài liệu Vercel nói thẳng:

> Cron expressions that would run more frequently will **fail deployment**.

Lịch ở trên là `0 * * * *` (mỗi giờ) — vượt giới hạn của Hobby, nên nếu project
đang ở gói Hobby thì **lần deploy sẽ fail**, không phải chỉ là cron im lặng.
Muốn giữ lịch mỗi giờ thì bắt buộc nâng lên gói **Pro**. Nếu phải ở lại Hobby thì
đổi `schedule` thành `0 3 * * *` (1 lần/ngày).

## `CRON_SECRET` bắt buộc phải có lúc build

Khi `crons` khác rỗng, Vercel CLI tự kiểm tra `CRON_SECRET` ở bước build
(`validateCronSecret` trong `packages/cli/src/commands/build/index.ts`) và **throw
nếu thiếu**. Nghĩa là phải khai báo `CRON_SECRET` trong Environment Variables của
project Vercel, nếu không mọi lần deploy đều fail — kể cả những lần deploy không
liên quan tới cron.

## Vì sao cần cron này

Nếu không có cron, việc hạ VIP tự động chỉ dựa vào `setInterval` bên trong process
(`premium.service.ts`, `onModuleInit`). Trên Vercel serverless, interval đó chết
theo từng instance — instance bị hủy/nởi lại là mất lịch, nên user VIP hết hạn có
thể không bao giờ bị hạ. `setInterval` chỉ nên coi là dự phòng cho môi trường
local, cron mới là đường chính.

Về độ chính xác thời điểm: kể cả trên Pro, Vercel chỉ bảo đảm trong **phút** được
chỉ định. Trên Hobby, cron có thể chạy bất cứ lúc nào trong cả giờ đó (±59 phút).
