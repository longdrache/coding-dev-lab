import dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Request, type Response } from 'express';
import { AppModule } from '../src/app.module.ts';
import { getCorsOrigins } from '../src/cors.ts';

dotenv.config();

const server = express();
let bootstrapPromise: Promise<typeof server> | undefined;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    rawBody: true,
  });
  app.enableCors({ origin: getCorsOrigins(), credentials: true });
  await app.init();
  return server;
}

export default async function handler(req: Request, res: Response) {
  bootstrapPromise ??= bootstrap();
  (await bootstrapPromise)(req, res);
}
