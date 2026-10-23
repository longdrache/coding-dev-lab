import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.ts';
import { AuthModule } from '../src/auth/auth.module.ts';
import { PresenceModule } from '../src/presence/presence.module.ts';
import { ActivityModule } from '../src/activity/activity.module.ts';
import { ProgressModule } from '../src/progress/progress.module.ts';
import { ProblemsModule } from '../src/problems/problems.module.ts';
import { SubmissionsModule } from '../src/submissions/submissions.module.ts';
import { ViewsModule } from '../src/views/views.module.ts';
import { QnaModule } from '../src/qna/qna.module.ts';
import { Judge0Module } from '../src/judge0/judge0.module.ts';
import { PremiumModule } from '../src/premium/premium.module.ts';
import { RagModule } from '../src/rag/rag.module.ts';
import { getCorsOrigins } from '../src/cors.ts';
import { RAG_INGEST_PATH, ragIngestBodyParser } from '../src/common/large-json-body.ts';
import { trustProxy } from '../src/proxy.ts';
import path from 'path';
dotenv.config();

const server = express();
let bootstrapPromise: Promise<typeof server> | undefined;

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(server), {
    rawBody: true,
  });
  // Bắt buộc: không có dòng này thì `req.ip` là IP của Vercel edge, mọi người dùng
  // chung một bucket rate-limit. Phải có ở CẢ `src/main.ts` và `api/index.ts`.
  trustProxy(app);
  app.enableCors({ origin: getCorsOrigins(), credentials: true });
  // Route ingest tài liệu RAG cần payload lớn; parser bọc riêng để Nest vẫn giữ
  // parser JSON mặc định cho các route còn lại.
  app.use('/api/docs', express.static(path.join(__dirname, 'node_modules', '@nestjs', 'swagger-ui-dist')));
  // Swagger docs chỉ được mount ở src/main.ts; entrypoint Vercel (api/index.ts)
  // không chạy main.ts, nên phải đăng ký lại ở đây để /api/docs hoạt động.
  setupPublicDocs(app);
  await app.init();
  return server;
}

export default async function handler(req: Request, res: Response) {
  bootstrapPromise ??= bootstrap();
  (await bootstrapPromise)(req, res);
}
