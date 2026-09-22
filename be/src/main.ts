import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.ts';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const origins = [
    process.env.FRONTEND_URL,
    'https://admin-code-lab.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter((o): o is string => !!o);
  app.enableCors({ origin: origins, credentials: true });
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
