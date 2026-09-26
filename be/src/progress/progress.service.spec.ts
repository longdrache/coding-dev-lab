import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BADGE_DEFS, calcStreakFromMap, ProgressService } from './progress.service.ts';

function vnKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  // dựng key dd-mm-yyyy theo giờ VN giống logic service
  const parts = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }).split('/');
  const [day, month, year] = parts;
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
}

describe('BADGE_DEFS', () => {
  it('12 huy hiệu, id duy nhất, đủ field', () => {
    expect(BADGE_DEFS).toHaveLength(12);
    const ids = BADGE_DEFS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BADGE_DEFS) {
      expect(b.name).toBeTruthy();
      expect(b.desc).toBeTruthy();
    }
  });
});

describe('calcStreakFromMap', () => {
  it('đếm chuỗi liên tiếp tới hôm nay', () => {
    const map: Record<string, number> = {
      [vnKey(0)]: 2,
      [vnKey(1)]: 1,
      [vnKey(2)]: 3,
    };
    expect(calcStreakFromMap(map)).toBe(3);
  });

  it('hôm nay nghỉ thì tính từ hôm qua', () => {
    const map: Record<string, number> = { [vnKey(1)]: 1, [vnKey(2)]: 1 };
    expect(calcStreakFromMap(map)).toBe(2);
  });

  it('đứt quãng thì dừng ở chỗ đứt, rỗng = 0', () => {
    const map: Record<string, number> = { [vnKey(0)]: 1, [vnKey(2)]: 1 };
    expect(calcStreakFromMap(map)).toBe(1);
    expect(calcStreakFromMap({})).toBe(0);
  });
});

describe('ProgressService.getDashboard (cache 200ms)', () => {
  function makeService() {
    const db = {
      activityDay: { findMany: vi.fn().mockResolvedValue([]) },
      solvedProblem: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
      userBadge: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    };
    return { svc: new ProgressService(db as any), db };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Một lần tính dashboard = 2 query activityDay: getActivityMap + evaluateBadges
  const QUERIES_PER_COMPUTE = 2;

  it('chỉ query DB một lần trong 200ms', async () => {
    const { svc, db } = makeService();
    await svc.getDashboard('u1');
    await svc.getDashboard('u1');
    await svc.getDashboard('u1');
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE);
  });

  it('hết 200ms thì query lại', async () => {
    const { svc, db } = makeService();
    await svc.getDashboard('u1');
    vi.advanceTimersByTime(199);
    await svc.getDashboard('u1');
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE);
    vi.advanceTimersByTime(1);
    await svc.getDashboard('u1');
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE * 2);
  });

  it('tách cache theo clerkId: user B không nhận dữ liệu user A', async () => {
    const { svc, db } = makeService();
    db.activityDay.findMany.mockImplementation((args: { where: { clerkId: string } }) =>
      Promise.resolve(args.where.clerkId === 'uA' ? [{ date: new Date(), count: 7 }] : []),
    );
    const a = await svc.getDashboard('uA');
    const b = await svc.getDashboard('uB');
    expect(Object.values(a.activityMap)).toEqual([7]);
    expect(Object.values(b.activityMap)).toEqual([]);
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE * 2);
  });

  it('trả về cùng object khi trong TTL, object mới khi hết TTL', async () => {
    const { svc } = makeService();
    const first = await svc.getDashboard('u1');
    expect(await svc.getDashboard('u1')).toBe(first);
    vi.advanceTimersByTime(200);
    expect(await svc.getDashboard('u1')).not.toBe(first);
  });
});
