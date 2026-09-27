import { describe, expect, it, vi } from 'vitest';
import { AdminService } from './admin.service.ts';

describe('AdminService login', () => {
  it('rejects bad password', async () => {
    process.env.ADMIN_EMAIL = 'a@a.com';
    process.env.ADMIN_PASSWORD = 'secret';
    process.env.JWT_SECRET = 'test-secret-32-chars-long-xxxxxx';
    // login() không chạm vào db — truyền stub rỗng
    const s = new AdminService({} as any);
    await expect(s.login('a@a.com', 'wrong')).rejects.toThrow();
  });
});

// Danh sách user lấy từ bảng `User` cục bộ.
// Stub db chỉ có `user`: thay nguồn truy vấn là test đỏ ngay (stub thiếu model).
describe('AdminService.listUsers', () => {
  function dbStub(rows: unknown[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    const count = vi.fn().mockResolvedValue(rows.length);
    return { db: { user: { findMany, count } }, findMany, count };
  }

  const AN = { id: 1, email: 'an@b.co', name: 'An', role: 'vip', createdAt: new Date('2026-01-01') };

  it('đọc bảng User cục bộ và trả id số kèm role', async () => {
    const { db, findMany, count } = dbStub([AN]);
    const res = await new AdminService(db as any).listUsers();
    // Nguồn dữ liệu phải là bảng User
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(count).toHaveBeenCalledTimes(1);
    // Không rò `passwordHash` ra ngoài
    expect(res.users[0]).toEqual({
      id: 1,
      email: 'an@b.co',
      name: 'An',
      role: 'vip',
      createdAt: AN.createdAt,
    });
    expect(res.totalCount).toBe(1);
  });

  it('bỏ role khỏi dữ liệu trả về thì test phải đỏ', async () => {
    const { db } = dbStub([AN]);
    const res = await new AdminService(db as any).listUsers();
    expect(res.users[0]).toHaveProperty('role', 'vip');
  });

  it('lọc tìm kiếm và đếm total cùng dùng một điều kiện', async () => {
    const { db, findMany, count } = dbStub([AN]);
    await new AdminService(db as any).listUsers({ query: 'an', limit: 10, offset: 20 });
    const args = findMany.mock.calls[0][0];
    // Lọc phía DB (ILIKE) chứ không kéo hết về filter tay
    expect(args.take).toBe(10);
    expect(args.skip).toBe(20);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.where.OR).toContainEqual({ email: { contains: 'an', mode: 'insensitive' } });
    expect(args.where.OR).toContainEqual({ name: { contains: 'an', mode: 'insensitive' } });
    expect(count.mock.calls[0][0].where).toEqual(args.where);
  });

  it('tìm theo id số khi query là số', async () => {
    const { db, findMany } = dbStub([AN]);
    await new AdminService(db as any).listUsers({ query: '7' });
    const where = findMany.mock.calls[0][0].where as { OR: Record<string, unknown>[] };
    expect(where.OR).toContainEqual({ id: 7 });
  });

  it('hasMore đúng khi trả đủ một trang', async () => {
    const { db } = dbStub([AN]);
    const res = await new AdminService(db as any).listUsers({ limit: 1 });
    expect(res.hasMore).toBe(true);
  });
});

describe('AdminService.getLoginAnalytics', () => {
  it('lấy tên từ bảng User, fallback sang email, khách vô danh thì hiện "Khách"', async () => {
    const userFindMany = vi.fn().mockResolvedValue([
      { id: 1, name: 'An', email: 'an@b.co' },
      { id: 2, name: null, email: 'bi@b.co' },
    ]);
    const db = {
      loginEvent: {
        findMany: vi.fn().mockResolvedValue([
          { userId: 1, country: 'VN', createdAt: new Date('2026-02-01') },
          { userId: 2, country: 'US', createdAt: new Date('2026-02-02') },
          { userId: null, country: '', createdAt: new Date('2026-02-03') },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ country: 'VN', count: 2 }]),
      user: { findMany: userFindMany },
    };
    const res = await new AdminService(db as any).getLoginAnalytics();
    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      select: { id: true, name: true, email: true },
    });
    expect(res.recent[0].name).toBe('An');
    expect(res.recent[1].name).toBe('bi@b.co');
    expect(res.recent[2].name).toBe('Khách');
    expect(res.recent.every((r: any) => r.avatar === null)).toBe(true);
  });
});

describe('AdminService.listSubmissions', () => {
  it('resolve user nộp bài từ bảng User cục bộ bằng userId số', async () => {
    const userFindMany = vi.fn().mockResolvedValue([
      { id: 7, email: 'bay@b.co', name: 'Bảy' },
    ]);
    const db = {
      submission: {
        findMany: vi.fn().mockResolvedValue([{ id: 's1', userId: 7, problemSlug: 'a-b' }]),
        count: vi.fn().mockResolvedValue(1),
      },
      user: { findMany: userFindMany },
    };
    const res = await new AdminService(db as any).listSubmissions();
    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: [7] } },
      select: { id: true, email: true, name: true },
    });
    expect(res.items[0].user).toEqual({ id: 7, email: 'bay@b.co', name: 'Bảy' });
  });

  it('tìm bài nộp theo email/tên của user trong bảng User', async () => {
    const db = {
      submission: {
        findMany: vi.fn().mockResolvedValue([
          { id: 's1', userId: 7, problemSlug: 'a-b' },
          { id: 's2', userId: 8, problemSlug: 'c-d' },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 7, email: 'bay@b.co', name: 'Bảy' },
          { id: 8, email: 'muoi@b.co', name: null },
        ]),
      },
    };
    const res = await new AdminService(db as any).listSubmissions({ query: 'bay' });
    expect(res.items.map((i: any) => i.id)).toEqual(['s1']);
  });
});
