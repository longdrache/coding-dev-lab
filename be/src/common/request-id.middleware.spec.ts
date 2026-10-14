import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REQUEST_ID_HEADER,
  RequestIdMiddleware,
} from './request-id.middleware.ts';

function fakeRes() {
  const handlers: Record<string, () => void> = {};
  return {
    headers: {} as Record<string, string>,
    statusCode: 200,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    on(event: string, fn: () => void) {
      handlers[event] = fn;
    },
    finish() {
      handlers['finish']?.();
    },
  };
}

describe('RequestIdMiddleware', () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    log.mockClear();
  });

  it('giữ x-request-id client gửi để truy vết xuyên FE→BE', () => {
    const mw = new RequestIdMiddleware();
    const res = fakeRes();
    const next = vi.fn();
    mw.use(
      { headers: { [REQUEST_ID_HEADER]: 'fe-123' }, originalUrl: '/api/problems' } as never,
      res as never,
      next,
    );
    expect(res.headers[REQUEST_ID_HEADER]).toBe('fe-123');
    expect(next).toHaveBeenCalled();
    res.finish();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('id=fe-123'));
  });

  it('sinh UUID khi client không gửi, log đủ method/url/status/ms', () => {
    const mw = new RequestIdMiddleware();
    const res = fakeRes();
    res.statusCode = 429;
    mw.use(
      { headers: {}, method: 'POST', originalUrl: '/api/auth/login' } as never,
      res as never,
      vi.fn(),
    );
    expect(res.headers[REQUEST_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    res.finish();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/POST \/api\/auth\/login 429 \d+ms id=/));
  });

  it('bỏ qua log cho /api/health để uptime monitor không tốn disk', () => {
    const mw = new RequestIdMiddleware();
    const res = fakeRes();
    mw.use(
      { headers: {}, originalUrl: '/api/health?x=1' } as never,
      res as never,
      vi.fn(),
    );
    expect(res.headers[REQUEST_ID_HEADER]).toBeTruthy();
    res.finish();
    expect(log).not.toHaveBeenCalled();
  });
});
