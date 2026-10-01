import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const THROTTLE_KEY = 'gocode:throttle';

export type ThrottleOptions = { limit: number; ttl: number };

/**
 * Ngưỡng mặc định cho **mọi** route không gắn `@Throttle`.
 *
 * Trước đây tầng này không có ngưỡng mặc định: route không gắn decorator thì
 * `canActivate` trả `true` ngay, và việc chặn đều do `express-rate-limit` (100
 * request/phút cho `*`) đảm nhiệm ở tầng middleware. Nếu gỡ middleware mà quên
 * thêm ngưỡng ở đây thì 51/68 route rơi vào trạng thái **không giới hạn** — hồi
 * quy bảo mật im lặng. Vì vậy ngưỡng mặc định phải bằng đúng mức mà tầng cũ đang
 * đặt (100/phút), chứ không phải một con số tự chọn.
 */
export const DEFAULT_THROTTLE: ThrottleOptions = { limit: 100, ttl: 60_000 };

/** Giữ nguyên API `@Throttle({ default: { limit, ttl } })` như @nestjs/throttler */
export function Throttle(opts: { default: ThrottleOptions }) {
  return SetMetadata(THROTTLE_KEY, opts.default);
}

type Bucket = { count: number; resetAt: number };
// In-memory theo instance (đủ chặn abuse cơ bản trên serverless)
const buckets = new Map<string, Bucket>();

function sweepExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Kill switch. Trước đây `DISABLE_RATE_LIMIT=1` chỉ tắt được tầng
    // `express-rate-limit` vì nó được đọc trong `AppModule.configure`; guard này
    // sống ở chỗ khác nên vẫn chạy và e2e vẫn ăn 429 từ nó. Giờ đây là tầng giới
    // hạn **duy nhất**, nên cờ phải tắt được cả hai. Đọc ở thời điểm gọi chứ không
    // ở constructor để test bật/tắt được trong cùng tiến trình.
    if (process.env.DISABLE_RATE_LIMIT === '1') return true;

    const cfg =
      this.reflector.getAllAndOverride<ThrottleOptions>(
        THROTTLE_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? DEFAULT_THROTTLE;

    const req = context.switchToHttp().getRequest() as {
      ip?: string;
    };
    // Chỉ `req.ip`, **không** tự đọc `x-forwarded-for`: `req.ip` của Express đã là
    // IP client thật vì `trust proxy` được bật ở cả entry point (xem `trustProxy`
    // trong `proxy.ts`). Nhánh đọc header thủ công trước đây là code chết — `req.ip`
    // không bao giờ `undefined` nên `??` không bao giờ rơi xuống — và nó cho ra kết
    // quả sai khi bật `trust proxy`: `req.ip` (cuối chuỗi, IP thật) lại thắng giá trị
    // client tự thêm ở đầu chuỗi, tức kẻ spam chỉ cần tiêm một số vào header là lách
    // được giới hạn theo IP.
    const ip = req.ip ?? 'unknown';
    const key = `${ip}:${context.getClass().name}:${context.getHandler().name}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + cfg.ttl };
      buckets.set(key, bucket);
      if (buckets.size > 5000) sweepExpired(now);
    }
    bucket.count += 1;
    if (bucket.count > cfg.limit) {
      throw new HttpException(
        'Quá nhiều yêu cầu, vui lòng thử lại sau',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
