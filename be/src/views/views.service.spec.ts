import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewsService } from './views.service.ts';

/**
 * SQL thô mà service gửi xuống Postgres, dựng lại từ tagged template của Prisma.
 *
 * Trước đây `$queryRaw` chỉ là `vi.fn()` trả `[]` — **không SQL nào chạy thật và
 * không test nào nhìn thấy chuỗi SQL**. Nên khi `PageView.userId` đổi từ text
 * (`clerkId`) sang integer mà `COALESCE` trong service không sửa theo, Postgres
 * báo `COALESCE types integer and text cannot be matched` và
 * `GET /api/admin/analytics/views` trả 500, mà toàn bộ test vẫn xanh.
 *
 * Giờ mock vẫn không chạy SQL (không cần database cho `pnpm test`), nhưng nó
 * **ghi lại** SQL + tham số để test dưới đây kiểm được. Bộ quét kiểu ở
 * `src/database/raw-sql-coalesce.spec.ts` soi source, và e2e ở
 * `test/api.e2e-spec.ts` chạy SQL thật trên Postgres.
 */
type RawCall = { sql: string; values: unknown[] };
let rawCalls: RawCall[] = [];

beforeEach(() => {
  rawCalls = [];
});

function makeService() {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: 42 }),
    },
    pageView: {
      create: vi.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
      count: vi.fn().mockResolvedValue(7),
    },
    $queryRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      rawCalls.push({ sql: strings.join('?'), values });
      return Promise.resolve([]);
    }),
  };
  return { svc: new ViewsService(db as any), db };
}

describe('ViewsService.hashIp', () => {
  it('ổn định + khác IP khác hash, không lộ IP', () => {
    const { svc } = makeService();
    expect(svc.hashIp('1.2.3.4')).toBe(svc.hashIp('1.2.3.4'));
    expect(svc.hashIp('1.2.3.4')).not.toBe(svc.hashIp('5.6.7.8'));
    expect(svc.hashIp('1.2.3.4')).not.toContain('1.2.3.4');
  });
});

describe('ViewsService.track', () => {
  it('cắt path/id dài và chuẩn hóa', async () => {
    const { svc, db } = makeService();
    await svc.track('h', 'x'.repeat(500), 42, 'v'.repeat(100), {}, '1.1.1.1');
    const data = (db.pageView.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(String(data.path)).toHaveLength(200);
    expect(data.userId).toBe(42);
    expect(String(data.visitorId)).toHaveLength(64);
  });

  it('khách chưa đăng nhập thì userId null, không phải 0', async () => {
    const { svc, db } = makeService();
    await svc.track('h', '/', undefined, 'v1', {}, undefined);
    await svc.track('h', '/', null, 'v1', {}, undefined);
    await svc.track('h', '/', 'abc' as unknown as number, 'v1', {}, undefined);
    for (const call of db.pageView.create.mock.calls) {
      const data = (call[0] as { data: Record<string, unknown> }).data;
      expect(data.userId).toBeNull();
    }
  });
});

describe('ViewsService.getAnalytics', () => {
  it('trả đủ today/month/year + series + byCountry', async () => {
    const { svc, db } = makeService();
    (db.$queryRaw as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{ uniques: 3 }])
      .mockResolvedValueOnce([{ uniques: 10 }])
      .mockResolvedValueOnce([{ uniques: 20 }])
      .mockResolvedValueOnce([{ date: '2026-01-01', views: 5, uniques: 2 }])
      .mockResolvedValueOnce([
        { country: 'VN', count: 4 },
        { country: 'XX', count: 1 },
      ]);
    const a = await svc.getAnalytics();
    expect(a.today).toEqual({ views: 7, uniques: 3 });
    expect(a.month.uniques).toBe(10);
    expect(a.year.uniques).toBe(20);
    expect(a.series30d).toHaveLength(1);
    expect(a.byCountry[0]).toEqual({ country: 'VN', count: 4 });
  });

  it('SQL thô phải còn nhìn thấy được, và mốc thời gian phải là tham số', async () => {
    const { svc } = makeService();
    await svc.getAnalytics();

    // 3 lần đếm unique (hôm nay/tháng/năm) + 1 series + 1 byCountry.
    expect(rawCalls).toHaveLength(5);
    for (const c of rawCalls) expect(c.sql).toContain('FROM "PageView"');

    const demUnique = rawCalls.filter((c) => c.sql.includes('COUNT(DISTINCT COALESCE('));
    expect(demUnique).toHaveLength(4);
    for (const c of demUnique) {
      // Mốc thời gian phải nội suy thành placeholder của Prisma, không ghép
      // chuỗi vào SQL — và mọi `COALESCE` đều đã cast cùng kiểu (Postgres không
      // tự cast, trộn `integer` với `text` là lỗi 500 lúc runtime).
      expect(c.sql).toContain('>= ?');
      expect(c.values.every((v) => v instanceof Date)).toBe(true);
      expect(c.sql).toMatch(/COALESCE\("userId"::text/);
    }
  });
});
