import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProblemsController } from './problems.controller.ts';
import type { UserRole } from '../auth/auth.types.ts';

const PUBLIC_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
/** Bài VIP phải rời khỏi cache chung: nội dung của nó phụ thuộc người gọi. */
const PRIVATE_CACHE = 'private, no-store';

function makeController() {
  const service = {
    findAll: vi.fn().mockResolvedValue([]),
    findBySlug: vi.fn().mockResolvedValue({ slug: 'two-sum', isVip: false }),
    submit: vi.fn().mockResolvedValue({ passed: true }),
  };
  const res = { setHeader: vi.fn(), getHeader: vi.fn() };
  return { ctrl: new ProblemsController(service as any), service, res };
}

function req(role?: UserRole) {
  return { headers: {}, user: role ? { userId: '7', role, roles: [role] } : undefined } as any;
}

describe('GET /api/problems — danh sách không phụ thuộc người gọi', () => {
  it('không nhận req, không đọc token: một payload cho mọi role', async () => {
    const { ctrl, service } = makeController();
    await ctrl.list();
    expect(service.findAll).toHaveBeenCalledOnce();
  });
});

describe('GET /api/problems/:slug — chặn bài VIP + header cache', () => {
  it('bài thường: header cache chung, khách không cần đăng nhập', async () => {
    const { ctrl, service, res } = makeController();
    await ctrl.get('two-sum', req(), res);
    expect(service.findBySlug).toHaveBeenCalledWith('two-sum', undefined);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', PUBLIC_CACHE);
  });

  it('bài thường + role vip trong token: vẫn header cache chung', async () => {
    const { ctrl, res } = makeController();
    await ctrl.get('two-sum', req('vip'), res);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', PUBLIC_CACHE);
  });

  it('bài VIP + vip/admin: nội dung đầy đủ nhưng phải rời cache chung', async () => {
    for (const role of ['vip', 'admin'] as const) {
      const { ctrl, service, res } = makeController();
      service.findBySlug.mockResolvedValue({ slug: 'trapping-rain-water', isVip: true });
      await ctrl.get('trapping-rain-water', req(role), res);
      expect(service.findBySlug).toHaveBeenCalledWith('trapping-rain-water', role);
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', PRIVATE_CACHE);
    }
  });

  it('bài VIP + khách/user: 403 problem_vip_only, KHÔNG set header cache chung', async () => {
    const { ctrl, service, res } = makeController();
    service.findBySlug.mockRejectedValue(
      Object.assign(new Error('x'), {
        response: { code: 'problem_vip_only' },
        getResponse: () => ({ code: 'problem_vip_only' }),
      }),
    );
    await expect(ctrl.get('trapping-rain-water', req(), res)).rejects.toBeDefined();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('slug không tồn tại: 404 kèm header cache chung (hành vi cũ, có test e2e ghim)', async () => {
    const { ctrl, service, res } = makeController();
    service.findBySlug.mockResolvedValue(null);
    await expect(ctrl.get('khong-ton-tai', req(), res)).rejects.toBeInstanceOf(NotFoundException);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', PUBLIC_CACHE);
  });
});

describe('POST /api/problems/:slug/submit — chuyển role xuống service', () => {
  it('truyền đúng role trong token', async () => {
    for (const role of ['user', 'vip', 'admin'] as const) {
      const { ctrl, service } = makeController();
      await ctrl.submit('two-sum', req(role), { languageId: 71, sourceCode: 'x' });
      expect(service.submit).toHaveBeenCalledWith('two-sum', 7, 71, 'x', role);
    }
  });

  it('thiếu languageId/sourceCode thì 404 như cũ, không gọi service', async () => {
    const { ctrl, service } = makeController();
    await expect(ctrl.submit('x', req('user'), { languageId: 0, sourceCode: '' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.submit).not.toHaveBeenCalled();
  });
});
