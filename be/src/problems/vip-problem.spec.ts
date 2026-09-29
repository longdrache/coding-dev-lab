import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  PROBLEM_VIP_ONLY_CODE,
  VIP_LIST_FIELDS,
  assertVipProblemAllowed,
  canAccessVipProblems,
  denyVipProblem,
  isVipProblemLocked,
  redactVipListRow,
} from './vip-problem.policy.ts';
import { VipProblemService } from './vip-problem.service.ts';
import type { UserRole } from '../auth/auth.types.ts';

/**
 * Mọi role đều phải ra đúng một kết luận. Bảng test này là hợp đồng: thêm một
 * role mới mà quên cập nhật thì `it` dưới đây đỏ, chứ không phải lúc chạy thật.
 */
const ROLES: Array<UserRole | undefined> = ['user', 'vip', 'admin', undefined];

describe('PROBLEM_VIP_ONLY_CODE', () => {
  it('ghim đúng chuỗi "problem_vip_only", không được đổi âm thầm', () => {
    // So với **chuỗi thật**, không so với chính hằng: hằng mà đổi thì mọi assert
    // dùng hằng vẫn xanh, và chỉ e2e (so chuỗi thật) mới đỏ — mà e2e cần DB.
    // Đây là hợp đồng với FE (`app/problem/vip-gate.ts`) nên phải ghim ở tầng unit.
    expect(PROBLEM_VIP_ONLY_CODE).toBe('problem_vip_only');
  });
});

describe('canAccessVipProblems', () => {
  it('chỉ vip và admin được mở bài VIP', () => {
    expect(canAccessVipProblems('vip')).toBe(true);
    expect(canAccessVipProblems('admin')).toBe(true);
    expect(canAccessVipProblems('user')).toBe(false);
    expect(canAccessVipProblems(undefined)).toBe(false);
    expect(canAccessVipProblems(null)).toBe(false);
  });
});

describe('isVipProblemLocked', () => {
  it('bài VIP khoá với mọi thứ trừ vip/admin', () => {
    for (const role of ROLES) {
      expect(isVipProblemLocked(true, role)).toBe(role !== 'vip' && role !== 'admin');
    }
  });

  it('bài thường thì không khoá với bất kỳ role nào — kể cả khách', () => {
    for (const role of ROLES) {
      expect(isVipProblemLocked(false, role)).toBe(false);
      expect(isVipProblemLocked(null, role)).toBe(false);
      expect(isVipProblemLocked(undefined, role)).toBe(false);
    }
  });
});

describe('denyVipProblem', () => {
  it('403 với mã lỗi ổn định để FE bắt được', () => {
    let err: unknown;
    try {
      denyVipProblem();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ForbiddenException);
    const ex = err as ForbiddenException;
    expect(ex.getStatus()).toBe(403);
    const body = ex.getResponse() as { code?: string; message?: string };
    expect(body.code).toBe(PROBLEM_VIP_ONLY_CODE);
    expect(body.message).toBeTruthy();
  });

  it('mọi lần gọi trả cùng một mã lỗi — FE so chuỗi, đổi câu thì hỏng UI', () => {
    const codes = [1, 2, 3].map(() => {
      try {
        denyVipProblem();
        return null;
      } catch (e) {
        return (e as ForbiddenException).getResponse() as { code?: string };
      }
    });
    expect(new Set(codes.map((c) => c?.code)).size).toBe(1);
  });
});

describe('assertVipProblemAllowed', () => {
  it('không ném cho bài thường dù role nào', () => {
    for (const role of ROLES) {
      expect(() => assertVipProblemAllowed(false, role)).not.toThrow();
    }
  });

  it('ném đúng mã lỗi cho bài VIP khi không phải vip/admin', () => {
    for (const role of ['user', undefined, null] as const) {
      expect(() => assertVipProblemAllowed(true, role)).toThrow(ForbiddenException);
    }
  });

  it('không ném cho vip và admin', () => {
    expect(() => assertVipProblemAllowed(true, 'vip')).not.toThrow();
    expect(() => assertVipProblemAllowed(true, 'admin')).not.toThrow();
  });
});

describe('redactVipListRow', () => {
  const row = {
    id: 'p1',
    slug: 'trapping-rain-water',
    title: 'Hứng nước mưa',
    difficulty: 'Khó',
    topic: 'array',
    status: 'published',
    description: 'CHO MANG NOI DUNG DE BAI',
    inputFormat: 'DONG 1 LA CHUOI',
    outputFormat: 'IN RA SO',
    constraints: ['n <= 10^5'],
    examples: [{ input: '1', output: '2' }],
    tests: [{ stdin: '1', expected: '2' }],
    hiddenTests: [{ stdin: 'x', expected: 'y' }],
    starterCodes: { '71': 'print(1)' },
    timeLimit: 1000,
    memoryLimit: 256000,
    isVip: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  it('chỉ còn slug/tiêu đề/độ khó/chủ đề/cờ khoá', () => {
    const out = redactVipListRow(row);
    expect(Object.keys(out).sort()).toEqual([...VIP_LIST_FIELDS].sort());
  });

  it('không còn đề bài, ví dụ, ràng buộc, test mẫu lẫn test ẩn', () => {
    const out = redactVipListRow(row);
    const serialized = JSON.stringify(out);
    for (const secret of [
      'CHO MANG NOI DUNG DE BAI',
      'DONG 1 LA CHUOI',
      'IN RA SO',
      'n <= 10^5',
      'print(1)',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    for (const field of [
      'description',
      'inputFormat',
      'outputFormat',
      'constraints',
      'examples',
      'tests',
      'hiddenTests',
      'starterCodes',
    ]) {
      expect(out).not.toHaveProperty(field);
    }
  });

  it('vẫn giữ tiêu đề và cờ khoá — người không VIP phải thấy bài trong danh sách', () => {
    const out = redactVipListRow(row);
    expect(out).toMatchObject({
      slug: 'trapping-rain-water',
      title: 'Hứng nước mưa',
      isVip: true,
    });
  });

  it('dòng thiếu cột isVip vẫn ra đúng allowlist, không lọt field lạ', () => {
    const out = redactVipListRow({ ...row, isVip: undefined, extra: 'x' });
    expect(Object.keys(out).sort()).toEqual([...VIP_LIST_FIELDS].sort());
    expect(out).not.toHaveProperty('extra');
  });
});

function makeVipService(isVip: boolean | null) {
  const db = {
    problem: {
      findUnique: vi.fn().mockResolvedValue(isVip === null ? null : { isVip }),
    },
  };
  const svc = new VipProblemService(db as any);
  return { svc, db };
}

describe('VipProblemService', () => {
  it('đọc cột isVip của đúng slug cần hỏi', async () => {
    const { svc, db } = makeVipService(true);
    await expect(svc.isVipSlug('trapping-rain-water')).resolves.toBe(true);
    expect(db.problem.findUnique).toHaveBeenCalledWith({
      where: { slug: 'trapping-rain-water' },
      select: { isVip: true },
    });
  });

  it('slug không tồn tại thì không phải bài VIP — không ném', async () => {
    const { svc } = makeVipService(null);
    await expect(svc.isVipSlug('khong-ton-tai')).resolves.toBe(false);
    await expect(svc.assertSlugAllowed('khong-ton-tai', 'user')).resolves.toBeUndefined();
  });

  it('bài VIP + user thường thì ném 403 problem_vip_only', async () => {
    const { svc } = makeVipService(true);
    await expect(svc.assertSlugAllowed('trapping-rain-water', 'user')).rejects.toMatchObject({
      response: { code: PROBLEM_VIP_ONLY_CODE },
    });
  });

  it('bài VIP + khách (không token) cũng bị chặn', async () => {
    const { svc } = makeVipService(true);
    await expect(svc.assertSlugAllowed('trapping-rain-water', undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('bài VIP + vip/admin thì đi qua', async () => {
    for (const role of ['vip', 'admin'] as const) {
      const { svc } = makeVipService(true);
      await expect(svc.assertSlugAllowed('trapping-rain-water', role)).resolves.toBeUndefined();
    }
  });

  it('bài thường thì mọi role đều qua, kể cả user', async () => {
    const { svc } = makeVipService(false);
    await expect(svc.assertSlugAllowed('two-sum', 'user')).resolves.toBeUndefined();
  });
});
