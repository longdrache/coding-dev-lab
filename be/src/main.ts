import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.ts';
import { AuthModule } from './auth/auth.module.ts';
import { PresenceModule } from './presence/presence.module.ts';
import { ActivityModule } from './activity/activity.module.ts';
import { ProgressModule } from './progress/progress.module.ts';
import { ProblemsModule } from './problems/problems.module.ts';
import { SubmissionsModule } from './submissions/submissions.module.ts';
import { ViewsModule } from './views/views.module.ts';
import { QnaModule } from './qna/qna.module.ts';
import { Judge0Module } from './judge0/judge0.module.ts';
import { PremiumModule } from './premium/premium.module.ts';
import { RagModule } from './rag/rag.module.ts';
import { getCorsOrigins } from './cors.ts';
import { RAG_INGEST_PATH, ragIngestBodyParser } from './common/large-json-body.ts';
import { trustProxy } from './proxy.ts';

dotenv.config();

/**
 * Tài liệu API tương tác (Swagger UI) ở `/api/docs`.
 *
 * Người mới mở `http://localhost:4000/api/docs` sẽ thấy danh sách mọi
 * endpoint public (auth, problems, submissions...), bấm vào từng cái để xem
 * tham số/body mẫu, và bấm "Try it out" để gọi thử API ngay trên trình duyệt
 * mà không cần Postman.
 *
 * Vì sao là danh sách liệt kê thay vì "tất cả trừ admin":
 * - `@nestjs/swagger` chỉ có option `include` (quét đúng module được nêu tên),
 *   không có `exclude`. Muốn giấu admin thì không còn cách nào khác ngoài việc
 *   kể ra từng module được lên docs.
 * - Hệ quả cần nhớ: **thêm module mới (ví dụ `NotificationModule`) thì phải
 *   thêm vào mảng `PUBLIC_API_MODULES` dưới đây**, nếu không route của nó vẫn
 *   chạy bình thường nhưng im lặng vắng mặt trong docs — không có lỗi nào báo
 *   cho bạn biết. Checklist khi thêm module: (1) thêm vào mảng này,
 *   (2) mở `/api/docs` kiểm tra route mới có hiện không.
 *
 * Vì sao admin không có mặt: docs này là tài liệu công khai — endpoint nội bộ
 * (quản lý user/bài nộp/doanh thu) không có chỗ ở đây. Admin vẫn test bằng
 * Playwright/API e2e như cũ.
 *
 * Vì sao mount cả ở production: mọi route trong docs đều đã public (khách
 * vãng lai gọi được), nên phơi hình endpoint không lộ gì thêm. Route nào cần
 * đăng nhập thì Swagger hiện nút Authorize — dán access token vào (lấy bằng
 * cách đăng nhập ở FE rồi copy, hoặc gọi `POST /api/auth/login`), hoặc dựa
 * vào cookie phiên nếu mở docs cùng trình duyệt đã đăng nhập.
 */
const PUBLIC_API_MODULES = [
  AuthModule,
  PresenceModule,
  ActivityModule,
  ProgressModule,
  ProblemsModule,
  SubmissionsModule,
  ViewsModule,
  QnaModule,
  Judge0Module,
  PremiumModule,
  RagModule,
];

/**
 * Dựng document OpenAPI từ code và gắn UI vào `/api/docs`.
 *
 * - `DocumentBuilder`: tiêu đề + mô tả + nút Authorize (Bearer) hiện trên đầu
 *   trang docs. Đổi chữ ở đây là đổi chữ trên UI, không ảnh hưởng API.
 * - `createDocument(app, config, { include })`: Nest quét controller của đúng
 *   các module trong mảng để sinh spec. Muốn docs chi tiết hơn (ví dụ mẫu
 *   cho từng field, mô tả từng endpoint) thì gắn decorator `@ApiOperation`,
 *   `@ApiResponse`, `@ApiProperty` vào controller/DTO tương ứng — việc tùy
 *   chọn, không bắt buộc để docs chạy.
 * - `SwaggerModule.setup('api/docs', ...)`: gắn cả UI (`GET /api/docs`) lẫn
 *   file spec thô (`GET /api/docs-json`) để import vào Postman/Insomnia.
 */
function setupPublicDocs(app: NestExpressApplication): void {
  const config = new DocumentBuilder()
    .setTitle('GoCode API')
    .setDescription(
      'Public API (auth, problems, submissions, progress, premium, judge0, views, presence, activity, Q&A). ' +
        'Admin endpoints are intentionally excluded. ' +
        'Authenticate with "Authorize" (paste access token as Bearer) — most routes also accept the session cookie.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config, { include: PUBLIC_API_MODULES });
  SwaggerModule.setup('api/docs', app, document);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  trustProxy(app);
  app.enableCors({ origin: getCorsOrigins(), credentials: true });
  // Route ingest tài liệu RAG là chỗ duy nhất gửi payload lớn (tối đa 5MB);
  // parser bọc riêng để Nest vẫn giữ parser JSON mặc định cho các route còn lại.
  app.use(RAG_INGEST_PATH, ragIngestBodyParser);
  setupPublicDocs(app);
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
