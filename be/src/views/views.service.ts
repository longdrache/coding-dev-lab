import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service.ts';

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

type DayRow = { date: string; views: number; uniques: number };

@Injectable()
export class ViewsService {
  constructor(private readonly db: DatabaseService) {}

  /** Hash IP (không lưu IP thô) để đếm unique mà vẫn tôn trọng riêng tư */
  hashIp(ip: string): string {
    const salt = process.env.IP_HASH_SALT ?? 'gocode-views';
    return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
  }

  async track(ipHash: string, path: string) {
    return this.db.pageView.create({
      data: { ipHash, path: path.slice(0, 200) || '/' },
    });
  }

  /** Mốc UTC tương ứng 00:00 giờ VN của ngày/tháng/năm chứa `at` */
  private vnDayStart(at: Date): Date {
    const vn = new Date(at.getTime() + VN_OFFSET_MS);
    return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS);
  }

  async getAnalytics() {
    const now = new Date();
    const vn = new Date(now.getTime() + VN_OFFSET_MS);
    const dayStart = this.vnDayStart(now);
    const monthStart = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - VN_OFFSET_MS);
    const yearStart = new Date(Date.UTC(vn.getUTCFullYear(), 0, 1) - VN_OFFSET_MS);
    const seriesStart = new Date(dayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

    const [dayRows, monthRows, yearRows, series] = await Promise.all([
      this.db.pageView.groupBy({ by: ['ipHash'], _count: { ipHash: true }, where: { createdAt: { gte: dayStart } } }),
      this.db.pageView.groupBy({ by: ['ipHash'], _count: { ipHash: true }, where: { createdAt: { gte: monthStart } } }),
      this.db.pageView.groupBy({ by: ['ipHash'], _count: { ipHash: true }, where: { createdAt: { gte: yearStart } } }),
      this.db.$queryRaw<DayRow[]>`
        SELECT to_char((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM-DD') AS date,
               COUNT(*)::int AS views,
               COUNT(DISTINCT "ipHash")::int AS uniques
        FROM "PageView"
        WHERE "createdAt" >= ${seriesStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ]);
    const [dayViews, monthViews, yearViews] = await Promise.all([
      this.db.pageView.count({ where: { createdAt: { gte: dayStart } } }),
      this.db.pageView.count({ where: { createdAt: { gte: monthStart } } }),
      this.db.pageView.count({ where: { createdAt: { gte: yearStart } } }),
    ]);

    return {
      today: { views: dayViews, uniques: dayRows.length },
      month: { views: monthViews, uniques: monthRows.length },
      year: { views: yearViews, uniques: yearRows.length },
      series30d: series,
    };
  }
}
