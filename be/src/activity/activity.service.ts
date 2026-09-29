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

function isPublicIp(ip: string): boolean {
  if (ip === 'unknown') return false;
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 0 || a >= 224) return false;
    return true;
  }
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return false;
  return ip.includes(':');
}

function formatKey(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Chỉ cần `activityDay.upsert` — không cần cả `DatabaseService`. Cấu hình kiểu
 * vậy để hàm này nhận được cả client Prisma thật lẫn db giả trong test mà không
 * phải cast.
 */
type AttendanceStore = {
  activityDay: {
    upsert(args: {
      where: { userId_date: { userId: number; date: Date } };
      create: { userId: number; date: Date; count: number };
      update: Record<string, never>;
    }): Promise<unknown>;
  };
};

/**
 * Đánh dấu "hôm nay user đã vào app": tạo dòng `ActivityDay` **nếu chưa có**,
 * và **không đụng** vào dòng đã có.
 *
 * Đây là nguồn sự thật duy nhất của nguyên tắc điểm danh — `ActivityService.recordLogin`
 * (gọi từ FE) và `AuthService.issueSession` (gọi khi cấp phiên) cùng đi qua đây.
 * Hai chỗ tự viết upsert riêng thì sẽ lệch `update: {}` với nhau, và chỗ sai
 * là chỗ **ghi đè mất** số lượt chạy thật của hôm nay.
 *
 * Vì sao `update: {}` là mấu chốt chống "thành 2":
 * - `@@unique([userId, date])` khiến một ngày chỉ có **một** dòng, nên gọi bao
 *   nhiêu lần trong ngày cũng không sinh dòng thứ hai.
 * - `update: {}` khiến dòng đã có giữ nguyên `count` — tài khoản cũ đã giải bài
 *   hôm nay không bị đè về 0, và chuỗi nhiều ngày của họ không bị reset.
 *
 * Lưu ý: streak **không** phải một cột nào đó, nó luôn được `calcStreakFromMap`
 * tính lại từ các dòng ở đây. Nên "đặt streak = 1" thực chất là "bảo đảm có
 * dòng của hôm nay", và chỉ ngày đầu mới tạo được dòng đó.
 */
export async function markAttendanceToday(db: AttendanceStore, userId: number): Promise<void> {
  const date = toDateOnly(todayKeyVietnam());
  await db.activityDay.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, count: 0 },
    update: {},
  });
}

@Injectable()
export class ActivityService {
  constructor(private readonly db: DatabaseService) {}

  async recordLogin(userId: number, meta?: { ip?: string; country?: string }) {
    await markAttendanceToday(this.db, userId);
    // Log lần đăng nhập + quốc gia. Chống spam: bỏ qua nếu đã có dòng
    // trong 1h qua, TRỪ khi quốc gia đổi (đi nước khác/bật VPN thì vẫn ghi)
    try {
      const salt = process.env.IP_HASH_SALT ?? 'gocode-views';
      const ip = meta?.ip ?? 'unknown';
      const ipHash = createHash('sha256').update(`${salt}:${ip}`).digest('hex');
      // Ưu tiên header Vercel (miễn phí, chính xác); không có thì tra
      // từ IP qua ip-api (public IP mới tra được, localhost luôn XX)
      let country = (meta?.country ?? '').toUpperCase().slice(0, 2);
      if (!country && isPublicIp(ip)) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 3000);
          const res = await fetch(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`,
            { signal: ctrl.signal },
          );
          clearTimeout(timer);
          const data = (await res.json().catch(() => null)) as {
            status?: string;
            countryCode?: string;
          } | null;
          if (data?.status === 'success' && data.countryCode) {
            country = data.countryCode.toUpperCase().slice(0, 2);
          }
        } catch {
          // tra cứu lỗi thì để trống, không vỡ login
        }
      }
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await this.db.loginEvent.findFirst({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
      });
      if (!recent || (country && recent.country !== country)) {
        await this.db.loginEvent.create({
          data: { userId, ipHash, country },
        });
      }
    } catch {
      // analytics không được làm vỡ login
    }
    return this.getMap(userId);
  }

  async recordRun(userId: number) {
    const key = todayKeyVietnam();
    const date = toDateOnly(key);
    await this.db.activityDay.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, count: 1 },
      update: { count: { increment: 1 } },
    });
    return this.getMap(userId);
  }

  async getMap(userId: number): Promise<Record<string, number>> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 400);
    const cutoffKey = `${String(cutoff.getUTCDate()).padStart(2, '0')}-${String(cutoff.getUTCMonth() + 1).padStart(2, '0')}-${cutoff.getUTCFullYear()}`;
    const rows = await this.db.activityDay.findMany({
      where: {
        userId,
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
