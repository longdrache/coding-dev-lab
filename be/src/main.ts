import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import { getCorsOrigins } from './cors.ts';
import { trustProxy } from './proxy.ts';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  trustProxy(app);
  app.enableCors({ origin: getCorsOrigins(), credentials: true });
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
