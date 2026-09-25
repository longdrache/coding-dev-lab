import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service.ts';

function todayKeyVietnam(): string {
  const d = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const [day, month, year] = d.split('/');
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
}

function toDateOnly(key: string): Date {
  // key dd-mm-yyyy -> yyyy-mm-dd for Date
  const [day, month, year] = key.split('-');
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

function formatKey(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

@Injectable()
export class ActivityService {
  constructor(private readonly db: DatabaseService) {}

  async recordLogin(clerkId: string, meta?: { ip?: string; country?: string }) {
    const key = todayKeyVietnam();
    const date = toDateOnly(key);
    await this.db.activityDay.upsert({
      where: { clerkId_date: { clerkId, date } },
      create: { clerkId, date, count: 0 },
      update: {},
    });
    // Log lần đăng nhập + quốc gia (tối đa 1 dòng/user/giờ để khỏi spam
    // vì FE gọi endpoint này mỗi lần vào trang khi đã đăng nhập)
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await this.db.loginEvent.findFirst({
        where: { clerkId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      });
      if (!recent) {
        const salt = process.env.IP_HASH_SALT ?? 'gocode-views';
        const ipHash = createHash('sha256').update(`${salt}:${meta?.ip ?? 'unknown'}`).digest('hex');
        const country = (meta?.country ?? '').toUpperCase().slice(0, 2);
        await this.db.loginEvent.create({
          data: { clerkId, ipHash, country },
        });
      }
    } catch {
      // analytics không được làm vỡ login
    }
    return this.getMap(clerkId);
  }

  async recordRun(clerkId: string) {
    const key = todayKeyVietnam();
    const date = toDateOnly(key);
    await this.db.activityDay.upsert({
      where: { clerkId_date: { clerkId, date } },
      create: { clerkId, date, count: 1 },
      update: { count: { increment: 1 } },
    });
    return this.getMap(clerkId);
  }

  async getMap(clerkId: string): Promise<Record<string, number>> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 400);
    const cutoffKey = `${String(cutoff.getUTCDate()).padStart(2, '0')}-${String(cutoff.getUTCMonth() + 1).padStart(2, '0')}-${cutoff.getUTCFullYear()}`;
    const rows = await this.db.activityDay.findMany({
      where: {
        clerkId,
        date: { gte: toDateOnly(cutoffKey) },
      },
      orderBy: { date: 'asc' },
    });
    const map: Record<string, number> = {};
    for (const row of rows) {
      const k = formatKey(row.date);
      map[k] = row.count;
    }
    return map;
  }
}
