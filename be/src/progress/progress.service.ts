import { Inject, Injectable, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DatabaseService } from '../database/database.service.ts';
import {
  DASHBOARD_TTL_MS,
  cacheStoreTtl,
  createLocalCache,
  dashboardKey,
} from '../common/cache.config.ts';
import type { UserRole } from '../auth/auth.types.ts';
import { VipProblemService } from '../problems/vip-problem.service.ts';

// Suy ra từ computeDashboard để đổi shape response không phải sửa type
// thủ công ở hai chỗ.
type Dashboard = Awaited<ReturnType<ProgressService['computeDashboard']>>;

export type BadgeDef = {
  id: string;
  name: string;
  desc: string;
  icon: 'streak' | 'zap' | 'star' | 'trophy' | 'target' | 'shield';
  color: 'orange' | 'teal' | 'yellow' | 'violet' | 'emerald' | 'sky';
};

export const BADGE_DEFS: BadgeDef[] = [
  { id: 'streak_3', name: 'Khởi động', desc: '3 ngày liên tiếp', icon: 'streak', color: 'orange' },
  { id: 'streak_7', name: 'Streak 7', desc: 'Đạt tuần 1', icon: 'streak', color: 'orange' },
  { id: 'streak_14', name: 'Kỷ luật', desc: '14 ngày', icon: 'shield', color: 'emerald' },
  { id: 'streak_30', name: 'Bền bỉ', desc: '30 ngày', icon: 'trophy', color: 'yellow' },
  { id: 'solve_1', name: 'First Solve', desc: 'Bài đầu tiên', icon: 'target', color: 'sky' },
  { id: 'solve_10', name: 'Solver 10', desc: '10 bài', icon: 'target', color: 'sky' },
  { id: 'solve_25', name: 'Solver 25', desc: '25 bài', icon: 'target', color: 'violet' },
  { id: 'solve_50', name: 'Solver 50', desc: '50 bài', icon: 'trophy', color: 'yellow' },
  { id: 'easy_10', name: 'Dễ 10', desc: '10 bài Dễ', icon: 'star', color: 'emerald' },
  { id: 'medium_10', name: 'Trung bình 10', desc: '10 bài TB', icon: 'star', color: 'emerald' },
  { id: 'fast_coder', name: 'Fast Coder', desc: '< 30ms', icon: 'zap', color: 'teal' },
  { id: 'dsa_pro', name: 'Thuật toán', desc: 'DSA Pro', icon: 'star', color: 'yellow' },
];

function todayKeyVietnam(): string {
  const d = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  const [day, month, year] = d.split('/');
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
}

function toDateOnly(key: string): Date {
  const [day, month, year] = key.split('-');
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

function formatKey(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export function calcStreakFromMap(map: Record<string, number>): number {
  let streak = 0;
  const cursor = new Date(toDateOnly(todayKeyVietnam()));
  // nếu hôm nay chưa có thì lùi 1 ngày
  const todayKey = todayKeyVietnam();
  if (!(todayKey in map)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (true) {
    const k = formatKey(cursor);
    if (!(k in map)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

@Injectable()
export class ProgressService {
  constructor(
    private readonly db: DatabaseService,
    private readonly vipProblems: VipProblemService,
    /**
     * Cache do `@nestjs/cache-manager` quản lý. `@Optional` vì có test dựng
     * service bằng `new ProgressService(db, vip)` (hai tham số) — xem lý do giống
     * ở `ProblemsService`. Thiếu DI thì tự tạo cache in-memory cùng loại, hành
     * vi không đổi.
     */
    @Optional()
    @Inject(CACHE_MANAGER)
    cache?: Cache,
  ) {
    this.cache = cache ?? createLocalCache();
  }

  private readonly cache: Cache;

  /**
   * Đánh dấu đã giải. Bài VIP thì chỉ `vip`/`admin` mới đánh dấu được — nếu không
   * thì `POST /api/progress/solve` là lối đi vòng: tự khai "xong" một bài mình
   * không đọc được đề, rồi dùng nó để lên huy hiệu `solve_50`/`dsa_pro`.
   *
   * Yêu thích (`addFavorite`) thì **không** chặn: tiêu đề bài VIP vốn đã hiện
   * công khai trong danh sách, nên việc bookmark nó không lộ gì.
   */
  async recordSolved(
    userId: number,
    slug: string,
    difficulty: string | null,
    role?: UserRole | null,
  ) {
    await this.vipProblems.assertSlugAllowed(slug, role);
    await this.db.solvedProblem.upsert({
      where: { userId_slug: { userId, slug } },
      create: { userId, slug, difficulty: difficulty ?? undefined },
      update: {},
    });
    await this.evaluateBadges(userId);
    return this.getDashboard(userId);
  }

  async getSolvedMap(userId: number) {
    const rows = await this.db.solvedProblem.findMany({ where: { userId } });
    const byDifficulty: Record<string, number> = { 'Dễ': 0, 'Trung bình': 0, 'Khó': 0 };
    for (const r of rows) {
      if (r.difficulty && r.difficulty in byDifficulty) byDifficulty[r.difficulty] += 1;
    }
    return {
      total: rows.length,
      byDifficulty,
      slugs: rows.map((r) => r.slug),
    };
  }

  async getFavorites(userId: number) {
    const rows = await this.db.favoriteProblem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return { total: rows.length, slugs: rows.map((r) => r.slug) };
  }

  async addFavorite(userId: number, slug: string) {
    await this.db.favoriteProblem.upsert({
      where: { userId_slug: { userId, slug } },
      create: { userId, slug },
      update: {},
    });
    return this.getFavorites(userId);
  }

  async removeFavorite(userId: number, slug: string) {
    try {
      await this.db.favoriteProblem.delete({
        where: { userId_slug: { userId, slug } },
      });
    } catch {
      // chưa từng favorite thì bỏ qua
    }
    return this.getFavorites(userId);
  }

  async getBadges(userId: number) {
    const stored = await this.db.userBadge.findMany({ where: { userId } });
    const _unlockedIds = new Set(stored.map((b) => b.badgeId));
    // đảm bảo đánh giá lại trước khi trả
    await this.evaluateBadges(userId);
    const refreshed = await this.db.userBadge.findMany({ where: { userId } });
    const unlocked = new Set(refreshed.map((b) => b.badgeId));
    return {
      total: BADGE_DEFS.length,
      unlocked: unlocked.size,
      list: BADGE_DEFS.map((d) => ({ ...d, unlocked: unlocked.has(d.id) })),
    };
  }

  private async evaluateBadges(userId: number) {
    const activityRows = await this.db.activityDay.findMany({ where: { userId } });
    const map: Record<string, number> = {};
    for (const r of activityRows) map[formatKey(r.date)] = r.count;
    const streak = calcStreakFromMap(map);
    const solved = await this.getSolvedMap(userId);
    const _topicsCovered = await this.db.solvedProblem.findMany({ where: { userId }, distinct: ['slug'] });
    // điều kiện
    const checks: Record<string, boolean> = {
      streak_3: streak >= 3,
      streak_7: streak >= 7,
      streak_14: streak >= 14,
      streak_30: streak >= 30,
      solve_1: solved.total >= 1,
      solve_10: solved.total >= 10,
      solve_25: solved.total >= 25,
      solve_50: solved.total >= 50,
      easy_10: (solved.byDifficulty['Dễ'] ?? 0) >= 10,
      medium_10: (solved.byDifficulty['Trung bình'] ?? 0) >= 10,
      fast_coder: solved.total >= 5, // placeholder: 5 bài
      dsa_pro: solved.total >= 12, // ~ đủ 2/3 kho
    };
    for (const [badgeId, ok] of Object.entries(checks)) {
      if (!ok) continue;
      await this.db.userBadge.upsert({
        where: { userId_badgeId: { userId, badgeId } },
        create: { userId, badgeId },
        update: {},
      });
    }
  }

  async getDashboard(userId: number) {
    // Dashboard đọc nặng (activityMap + solved + badges + heatmap) và được
    // gọi lại liên tục. TTL rất ngắn chỉ để gom các lần gọi sát nhau, không
    // phải cache dài hạn — sau POST /solve có thể hiện dữ liệu cũ tối đa
    // 200ms, không người dùng nào nhận ra.
    //
    // Khoá theo `userId` (xem `dashboardKey`): dashboard là dữ liệu riêng của
    // từng user, dùng chung một key sẽ lộ dữ liệu chéo.
    const hit = await this.cache.get<Dashboard>(dashboardKey(userId));
    if (hit) return hit;
    const out = await this.computeDashboard(userId);
    await this.cache.set(dashboardKey(userId), out, cacheStoreTtl(DASHBOARD_TTL_MS));
    return out;
  }

  private async computeDashboard(userId: number) {
    const activityMap = await this.getActivityMap(userId);
    const streak = calcStreakFromMap(activityMap);
    const solved = await this.getSolvedMap(userId);
    const badges = await this.getBadges(userId);
    // heatmap 35 ngày
    const heatmap = this.buildHeatmap(activityMap, 35);
    return {
      activityMap,
      streak,
      solved,
      badges,
      heatmap,
      todayKey: todayKeyVietnam(),
    };
  }

  private async getActivityMap(userId: number): Promise<Record<string, number>> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 400);
    const cutoffKey = formatKey(cutoff);
    const rows = await this.db.activityDay.findMany({
      where: { userId, date: { gte: toDateOnly(cutoffKey) } },
      orderBy: { date: 'asc' },
    });
    const map: Record<string, number> = {};
    for (const r of rows) map[formatKey(r.date)] = r.count;
    return map;
  }

  private buildHeatmap(map: Record<string, number>, days: number) {
    const arr: { date: string; count: number; active: boolean }[] = [];
    const today = toDateOnly(todayKeyVietnam());
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const k = formatKey(d);
      arr.push({ date: k, count: map[k] ?? 0, active: k in map });
    }
    return arr;
  }
}
