import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BADGE_DEFS, calcStreakFromMap, ProgressService } from './progress.service.ts';
import { VipProblemService } from '../problems/vip-problem.service.ts';
import { PROBLEM_VIP_ONLY_CODE } from '../problems/vip-problem.policy.ts';

function makeVipStub(isVip: boolean) {
  return new VipProblemService({
    problem: { findUnique: vi.fn().mockResolvedValue({ isVip }) },
  } as any);
}

function makeSolveService(isVip: boolean) {
  const db = {
    activityDay: { findMany: vi.fn().mockResolvedValue([]) },
    solvedProblem: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    userBadge: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    favoriteProblem: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { svc: new ProgressService(db as any, makeVipStub(isVip)), db };
}

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

describe('ProgressService.getDashboard (cache 300s)', () => {
  function makeService() {
    const db = {
      activityDay: { findMany: vi.fn().mockResolvedValue([]) },
      solvedProblem: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
      userBadge: { findMany: vi.fn().mockResolvedValue([]), upsert: vi.fn() },
    };
    return { svc: new ProgressService(db as any, makeVipStub(false)), db };
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
    await svc.getDashboard(1);
    await svc.getDashboard(1);
    await svc.getDashboard(1);
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE);
  });

  it('hết TTL thì query lại', async () => {
    const { svc, db } = makeService();
    await svc.getDashboard(1);
    vi.advanceTimersByTime(299_999);
    await svc.getDashboard(1);
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE);
    vi.advanceTimersByTime(1);
    await svc.getDashboard(1);
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE * 2);
  });

  it('tách cache theo userId: user B không nhận dữ liệu user A', async () => {
    const { svc, db } = makeService();
    db.activityDay.findMany.mockImplementation((args: { where: { userId: number } }) =>
      Promise.resolve(args.where.userId === 101 ? [{ date: new Date(), count: 7 }] : []),
    );
    const a = await svc.getDashboard(101);
    const b = await svc.getDashboard(102);
    expect(Object.values(a.activityMap)).toEqual([7]);
    expect(Object.values(b.activityMap)).toEqual([]);
    expect(db.activityDay.findMany).toHaveBeenCalledTimes(QUERIES_PER_COMPUTE * 2);
  });

  it('trả về cùng object khi trong TTL, object mới khi hết TTL', async () => {
    const { svc } = makeService();
    const first = await svc.getDashboard(1);
    expect(await svc.getDashboard(1)).toBe(first);
    vi.advanceTimersByTime(300_000);
    expect(await svc.getDashboard(1)).not.toBe(first);
  });
});

describe('ProgressService.recordSolved chặn bài VIP', () => {
  it('VIP + user thường → 403 problem_vip_only, không ghi SolvedProblem', async () => {
    const { svc, db } = makeSolveService(true);
    await expect(
      svc.recordSolved(1, 'trapping-rain-water', 'Khó', 'user'),
    ).rejects.toMatchObject({ response: { code: PROBLEM_VIP_ONLY_CODE } });
    expect(db.solvedProblem.upsert).not.toHaveBeenCalled();
  });

  it('VIP + vip thì ghi được', async () => {
    const { svc, db } = makeSolveService(true);
    await svc.recordSolved(1, 'trapping-rain-water', 'Khó', 'vip');
    expect(db.solvedProblem.upsert).toHaveBeenCalledOnce();
  });

  it('bài thường + user thường thì không đổi hành vi cũ', async () => {
    const { svc, db } = makeSolveService(false);
    await svc.recordSolved(1, 'two-sum', 'Dễ', 'user');
    expect(db.solvedProblem.upsert).toHaveBeenCalledOnce();
  });

  it('đánh dấu yêu thích bài VIP thì vẫn được — bookmark tiêu đề đã công khai', async () => {
    const { svc, db } = makeSolveService(true);
    await svc.addFavorite(1, 'trapping-rain-water');
    expect(db.favoriteProblem.upsert).toHaveBeenCalledOnce();
  });
});
