import { describe, expect, it } from 'vitest';
import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import { trustProxy, TRUST_PROXY_HOPS } from './proxy.ts';

/** Route báo `req.ip` để quan sát được IP mà rate-limit sẽ dùng. */
function appReportingIp(): Express {
  const app = express();
  app.get('/ip', (req, res) => {
    res.json({ ip: req.ip, ips: req.ips });
  });
  return app;
}

describe('trust proxy', () => {
  it('bật đúng số hop đã chốt', () => {
    const app = appReportingIp();
    trustProxy(app);
    expect(app.get('trust proxy')).toBe(TRUST_PROXY_HOPS);
    expect(TRUST_PROXY_HOPS).toBe(1);
  });

  it('bật rồi thì req.ip là IP client thật, không phải IP của proxy', async () => {
    const app = appReportingIp();
    trustProxy(app);
    const res = await request(app)
      .get('/ip')
      // Vercel nối tiếp IP thật của người gọi vào CUỐI X-Forwarded-For. `trust
      // proxy: 1` bỏ đúng 1 địa chỉ tính từ socket rồi lấy phần tử kế, nên ra
      // `70.41.3.18` — phần tử cuối, tức IP thật.
      .set('X-Forwarded-For', '203.0.113.9, 70.41.3.18');
    expect(res.body.ip).toBe('70.41.3.18');
    // `req.ips` chỉ liệt kê đúng chuỗi hop đáng tin: dừng ngay ở địa chỉ đầu tiên
    // không đáng tin khi đi từ phải sang.
    expect(res.body.ips).toEqual(['70.41.3.18']);
  });

  it('client tự thêm vào đầu X-Forwarded-For thì vẫn không đổi req.ip', async () => {
    // Giả mạo IP để lách rate-limit: chỉ thêm được ở đầu chuỗi, mà `trust proxy: 1`
    // đọc từ cuối. Nếu sau này đổi sang `trust proxy: true` thì test này đỏ.
    const app = appReportingIp();
    trustProxy(app);
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '1.2.3.4, 203.0.113.9, 70.41.3.18');
    expect(res.body.ip).toBe('70.41.3.18');
  });

  it('CONTROL: không bật thì req.ip là IP socket, mọi người dùng chung một bucket', async () => {
    // Đây là hành vi trước khi sửa: `req.ip` = 127.0.0.1 và X-Forwarded-For bị bỏ
    // qua, nên rate-limit tính cho cả hệ thống. Test phải xanh để chứng minh việc
    // sửa là có tác dụng thật chứ không phải đổi hình thức.
    const app = appReportingIp();
    const res = await request(app)
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.9, 70.41.3.18');
    expect(res.body.ip).not.toBe('203.0.113.9');
    expect(res.body.ip).toBe('::ffff:127.0.0.1');
  });

  it('chỉ một X-Forwarded-For cũng ra IP client', async () => {
    const app = appReportingIp();
    trustProxy(app);
    const res = await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.7');
    expect(res.body.ip).toBe('198.51.100.7');
  });
});
