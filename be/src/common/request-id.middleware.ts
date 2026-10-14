import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Request-id + access log cho mọi request.
 *
 * - Client (FE) gửi `x-request-id` thì giữ nguyên để truy vết xuyên FE→BE;
 *   không có thì sinh UUID. Id trả về trong response header cùng tên để
 *   user báo lỗi kèm id, grep log là ra đúng request.
 * - Ghi một dòng khi response xong: method + URL + status + thời gian xử lý.
 *   Middleware chạy TRƯỚC guards nên cả request bị 401/429 vẫn có log —
 *   nhìn thấy abuse mà không cần đoán.
 * - Bỏ qua `/api/health`: uptime monitor gọi mỗi 30s, log nó chỉ tốn disk.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

type RequestWithId = Request & { id?: string };

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id =
      (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() || randomUUID();
    req.id = id;
    res.setHeader(REQUEST_ID_HEADER, id);

    if (req.originalUrl?.split('?')[0] === '/api/health') {
      next();
      return;
    }
    const start = Date.now();
    res.on('finish', () => {
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms id=${id}`,
      );
    });
    next();
  }
}
