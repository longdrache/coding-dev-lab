import { describe, expect, it, vi } from 'vitest';
import { ViewsService } from './views.service.ts';

function makeService() {
  const db = {
    pageView: {
      create: vi.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
      count: vi.fn().mockResolvedValue(7),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
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
    await svc.track('h', 'x'.repeat(500), 'u'.repeat(100), 'v'.repeat(100), {}, '1.1.1.1');
    const data = (db.pageView.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(String(data.path)).toHaveLength(200);
    expect(String(data.clerkId)).toHaveLength(64);
    expect(String(data.visitorId)).toHaveLength(64);
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
});
