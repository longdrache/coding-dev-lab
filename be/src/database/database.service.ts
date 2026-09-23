import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Ưu tiên direct connection (DATABASE_URL_UNPOOLED) để tránh các
    // hành vi treo/kill của Neon pooler; fallback pooler URL nếu thiếu.
    // Pool nhỏ + evict idle sớm để không giữ connection chết.
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX ?? 10),
      // Đóng connection idle sau 10s (sớm hơn Neon kill)
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 10_000),
      connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS ?? 15_000),
      allowExitOnIdle: true,
      keepAlive: true,
    });
    pool.on('error', (err) => {
      console.error('[pg pool] idle client error, pool sẽ thay thế:', err.message);
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
