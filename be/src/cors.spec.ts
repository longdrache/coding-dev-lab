import { describe, expect, it, afterEach } from 'vitest';
import { getCorsOrigins } from './cors.ts';

/**
 * Danh sách origin CORS là **ranh giới tin cậy của backend**: thêm nhầm một origin
 * là mở API cho trang đó đọc bằng cookie phiên, nên danh sách này phải là hằng
 * khai báo tường minh chứ không phải `true` hay `*`.
 *
 * `.filter(o => !!o)` loại biến chưa đặt — local thiếu `FRONTEND_URL` thì origin
 * `undefined` lọt vào header sẽ khiến trình duyệt từ chối origin hợp lệ.
 */
const BIEN_CU = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  process.env = { ...BIEN_CU };
});

describe('getCorsOrigins', () => {
  it('luôn kèm các origin hard-code, kể cả khi biến môi trường trống', () => {
    setEnv({ FRONTEND_URL: undefined, FRONTEND_ADMIN_URL: undefined });
    const origins = getCorsOrigins();
    expect(origins).toContain('https://admin-code-lab.vercel.app');
    expect(origins).toContain('https://admin-coding-lab.vercel.app');
    expect(origins).toContain('http://localhost:3000');
    expect(origins).toContain('http://localhost:3001');
  });

  it('không bao giờ trả về origin rỗng — header `undefined` làm hỏng CORS', () => {
    setEnv({ FRONTEND_URL: undefined, FRONTEND_ADMIN_URL: undefined });
    for (const o of getCorsOrigins()) expect(o).toBeTruthy();
  });

  it('lấy FE và admin từ biến môi trường, đặt trước origin hard-code', () => {
    setEnv({ FRONTEND_URL: 'https://go-code.vercel.app', FRONTEND_ADMIN_URL: 'https://admin.vercel.app' });
    const origins = getCorsOrigins();
    expect(origins[0]).toBe('https://go-code.vercel.app');
    expect(origins[1]).toBe('https://admin.vercel.app');
  });

  it('biến rỗng thì bị lọc, không để lọt chuỗi rỗng', () => {
    setEnv({ FRONTEND_URL: '', FRONTEND_ADMIN_URL: undefined });
    expect(getCorsOrigins()).not.toContain('');
  });
});
