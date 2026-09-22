import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';
import { getCorsOrigins } from './cors.ts';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: getCorsOrigins(), credentials: true });
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
