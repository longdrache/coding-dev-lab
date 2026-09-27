import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type Request, type Response } from 'express';
import { AppModule } from '../src/app.module.ts';
import { getCorsOrigins } from '../src/cors.ts';
import { trustProxy } from '../src/proxy.ts';

dotenv.config();

const server = express();
let bootstrapPromise: Promise<typeof server> | undefined;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(server), {
    rawBody: true,
  });
  // Bắt buộc: không có dòng này thì `req.ip` là IP của Vercel edge, mọi người dùng
  // chung một bucket rate-limit. Phải có ở CẢ `src/main.ts` và `api/index.ts`.
  trustProxy(app);
  app.enableCors({ origin: getCorsOrigins(), credentials: true });
  await app.init();
  return server;
}

export default async function handler(req: Request, res: Response) {
  bootstrapPromise ??= bootstrap();
  (await bootstrapPromise)(req, res);
}
