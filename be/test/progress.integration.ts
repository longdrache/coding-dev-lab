/**
 * Progress + Activity pilot cho integration test: `ProgressService`
 * (solve/favorites/badges/dashboard) + `ActivityService` (điểm danh, login/run,
 * heatmap/streak) với Postgres thật.
 *
 * Chỗ khó duy nhất là "ngày": streak tính theo ngày Việt Nam
 * (`todayKeyVietnam`), còn `formatKey` đọc theo UTC. Seed ngày quá khứ trong
 * test phải neo vào "hôm nay VN" y như app (hàm `vnTodayUTC` dưới đây copy đúng
 * công thức đó), nếu không múi giờ runner lệch là streak đứt giả.
 *
 * `fetch` chỉ stub trong đúng 1 test đường tra cứu ip-api; mọi test khác truyền
 * country sẵn nên không chạm mạng.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service.ts';
import { VipProblemService } from '../src/problems/vip-problem.service.ts';
import { ProgressService } from '../src/progress/progress.service.ts';
import { ActivityService } from '../src/activity/activity.service.ts';
import {
  requireTestDatabaseUrl,
  resetAuthTables,
  uniqueEmail,
} from './db-integration.ts';

const DAY = 24 * 60 * 60 * 1000;

/** "Hôm nay VN" ở dạng UTC-midnight — cùng công thức `todayKeyVietnam` của app. */
function vnTodayUTC(): Date {
  const d = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
  const [day, month, year] = d.split('/');
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}
const vnDayAgo = (n: number) => new Date(vnTodayUTC().getTime() - n * DAY);
const vnKey = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;

describe('Progress + Activity (integration, DB thật)', () => {
  let db: DatabaseService;
  let progress: ProgressService;
  let activity: ActivityService;

  beforeAll(async () => {
    requireTestDatabaseUrl();
    db = new DatabaseService();
    try {
      await db.$connect();
    } catch (e) {
      throw new Error(
        `Không nối được DB test — chạy \`prisma migrate deploy\` vào DB đó trước. ` +
          `Gốc: ${e instanceof Error ? e.message : e}`,
      );
    }
  });

  afterAll(async () => {
    await resetAuthTables(db);
    await db.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    await db.problem.deleteMany({ where: { slug: { startsWith: 'itest-' } } });
    await resetAuthTables(db);
    // Cache dashboard là in-memory theo instance — dựng mới mỗi test để số
    // liệu test trước không rò sang test sau qua cache 200ms.
    progress = new ProgressService(db, new VipProblemService(db));
    activity = new ActivityService(db);
  });

  async function seedUser() {
    return db.user.create({ data: { email: uniqueEmail('itest-prog') } });
  }

  async function seedVipProblem() {
    return db.problem.create({
      data: {
        slug: `itest-vip-${Date.now()}`,
        title: 'Bài VIP test',
        difficulty: 'easy',
        topic: 'arrays',
        description: 'đề test',
        tests: [],
        hiddenTests: [],
        isVip: true,
      },
    });
  }

  it('recordLogin điểm danh + ghi loginEvent băm IP, không ghi IP thô', async () => {
    const u = await seedUser();
    const map = await activity.recordLogin(u.id, { ip: '203.0.113.7', country: 'VN' });
    expect(map[vnKey(vnTodayUTC())]).toBeGreaterThanOrEqual(0);
    const rows = await db.loginEvent.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].country).toBe('VN');
    expect(rows[0].ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].ipHash).not.toContain('203.0.113.7');
  });

  it('login 2 lần trong 1h cùng quốc gia chỉ ghi 1 dòng, đổi quốc gia thì ghi thêm', async () => {
    const u = await seedUser();
    await activity.recordLogin(u.id, { ip: '10.0.0.1', country: 'VN' });
    await activity.recordLogin(u.id, { ip: '10.0.0.2', country: 'VN' });
    expect(await db.loginEvent.count({ where: { userId: u.id } })).toBe(1);
    await activity.recordLogin(u.id, { ip: '10.0.0.3', country: 'US' });
    expect(await db.loginEvent.count({ where: { userId: u.id } })).toBe(2);
  });

  it('thiếu country + IP public thì tra ip-api (fetch stub), hỏng cũng không vỡ', async () => {
    const u = await seedUser();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', countryCode: 'us' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await activity.recordLogin(u.id, { ip: '8.8.8.8' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('8.8.8.8');
    const rows = await db.loginEvent.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].country).toBe('US');
  });

  it('recordRun tăng count hôm nay, getMap thấy đúng key ngày VN', async () => {
    const u = await seedUser();
    await activity.recordRun(u.id);
    await activity.recordRun(u.id);
    const map = await activity.getMap(u.id);
    expect(map[vnKey(vnTodayUTC())]).toBe(2);
  });

  it('recordSolved ghi solved + mở badge solve_1, bài VIP chặn role thường', async () => {
    const u = await seedUser();
    const dash = await progress.recordSolved(u.id, 'two-sum', 'Dễ', 'user');
    expect(dash.solved.total).toBe(1);
    const badges = await progress.getBadges(u.id);
    const solve1 = badges.list.find((b) => b.id === 'solve_1');
    expect(solve1?.unlocked).toBe(true);
    const vip = await seedVipProblem();
    // `POST /solve` là lối tự khai đã giải bài không đọc được đề — phải chặn
    // ở service chứ không chỉ ở route submit.
    await expect(progress.recordSolved(u.id, vip.slug, 'Dễ', 'user')).rejects.toMatchObject({
      status: 403,
    });
    expect(
      await db.solvedProblem.count({ where: { userId: u.id } }),
    ).toBe(1);
  });

  it('getSolvedMap đếm theo độ khó, favorites thêm/xoá/sắp mới-nhất-trước', async () => {
    const u = await seedUser();
    await progress.recordSolved(u.id, 'bai-de-1', 'Dễ', 'user');
    await progress.recordSolved(u.id, 'bai-de-2', 'Dễ', 'user');
    await progress.recordSolved(u.id, 'bai-kho', 'Khó', 'user');
    const map = await progress.getSolvedMap(u.id);
    expect(map.total).toBe(3);
    expect(map.byDifficulty['Dễ']).toBe(2);
    expect(map.byDifficulty['Khó']).toBe(1);
    await progress.addFavorite(u.id, 'bai-de-1');
    await progress.addFavorite(u.id, 'bai-kho');
    const fav = await progress.getFavorites(u.id);
    expect(fav.total).toBe(2);
    expect(fav.slugs).toEqual(['bai-kho', 'bai-de-1']);
    await progress.removeFavorite(u.id, 'bai-kho');
    expect((await progress.getFavorites(u.id)).slugs).toEqual(['bai-de-1']);
    // Xoá cái chưa từng thích không ném.
    await expect(progress.removeFavorite(u.id, 'chua-thich')).resolves.toBeTruthy();
  });

  it('streak 3 ngày liên tiếp mở badge streak_3, dashboard thấy streak', async () => {
    const u = await seedUser();
    // Hôm nay có mặt nhờ recordRun; 2 hôm trước seed trực tiếp đúng key VN.
    await activity.recordRun(u.id);
    for (const nAgo of [1, 2]) {
      await db.activityDay.create({ data: { userId: u.id, date: vnDayAgo(nAgo), count: 1 } });
    }
    const badges = await progress.getBadges(u.id);
    expect(badges.list.find((b) => b.id === 'streak_3')?.unlocked).toBe(true);
    expect(badges.list.find((b) => b.id === 'streak_7')?.unlocked).toBe(false);
    const dash = await progress.getDashboard(u.id);
    expect(dash.streak).toBeGreaterThanOrEqual(3);
    expect(dash.heatmap).toHaveLength(35);
    expect(dash.todayKey).toBe(vnKey(vnTodayUTC()));
  });

  it('ngày đứt quãng thì streak chỉ tính chuỗi tới hôm nay', async () => {
    const u = await seedUser();
    await activity.recordRun(u.id);
    // Hôm qua vắng, chỉ có hôm kia — chuỗi tới hôm nay dài đúng 1.
    await db.activityDay.create({ data: { userId: u.id, date: vnDayAgo(2), count: 1 } });
    const dash = await progress.getDashboard(u.id);
    expect(dash.streak).toBe(1);
  });
});
