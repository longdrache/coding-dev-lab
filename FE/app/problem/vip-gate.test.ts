import { describe, expect, it } from 'vitest';
import {
  PROBLEM_VIP_ONLY_CODE,
  canOpenVipProblem,
  isVipLockedError,
  isVipProblem,
  shouldShowVipLock,
  vipBadge,
  vipLockHref,
  type ViewerRole,
} from './vip-gate';

/** Đủ mọi trạng thái `user?.role` mà `useSession()` có thể trả về. */
const ROLES: Array<ViewerRole> = ['user', 'vip', 'admin', null, undefined];

describe('PROBLEM_VIP_ONLY_CODE', () => {
  it('ghim đúng chuỗi "problem_vip_only" — hợp đồng với BE', () => {
    // So với chuỗi thật chứ không so với hằng cùng file: đổi hằng thì test so
    // hằng vẫn xanh, và chỉ khi nào BE không khớp nữa thì màn khoá mới hỏng —
    // tức lúc đó, ở production, chứ không phải ở `pnpm test`.
    expect(PROBLEM_VIP_ONLY_CODE).toBe('problem_vip_only');
  });
});

describe('canOpenVipProblem', () => {
  it('chỉ vip và admin mở được bài VIP', () => {
    expect(canOpenVipProblem('vip')).toBe(true);
    expect(canOpenVipProblem('admin')).toBe(true);
    expect(canOpenVipProblem('user')).toBe(false);
    // Khách **hoặc** phiên chưa xác minh xong đều phải bị coi là người thường —
    // mở rộng quyền lúc `loading` là lỗ hổng lộ đề bài trước khi `/me` trả lời.
    expect(canOpenVipProblem(null)).toBe(false);
    expect(canOpenVipProblem(undefined)).toBe(false);
  });
});

describe('isVipProblem', () => {
  it('bài thường thì không phải bài VIP, với mọi role', () => {
    for (const role of ROLES) expect(isVipProblem(false, role)).toBe(false);
  });

  it('bài VIP thì khoá đúng với người thường và khách', () => {
    expect(isVipProblem(true, 'user')).toBe(true);
    expect(isVipProblem(true, null)).toBe(true);
    expect(isVipProblem(true, undefined)).toBe(true);
  });

  it('bài VIP thì vip/admin không bị khoá', () => {
    expect(isVipProblem(true, 'vip')).toBe(false);
    expect(isVipProblem(true, 'admin')).toBe(false);
  });

  it('role lạ (chuỗi rác từ API) thì coi như người thường', () => {
    expect(isVipProblem(true, 'root' as ViewerRole)).toBe(true);
  });
});

describe('shouldShowVipLock', () => {
  it('chỉ hiện dấu khoá cho người không mở được bài VIP', () => {
    expect(shouldShowVipLock(true, 'user')).toBe(true);
    expect(shouldShowVipLock(true, 'vip')).toBe(false);
    expect(shouldShowVipLock(true, 'admin')).toBe(false);
    expect(shouldShowVipLock(false, 'user')).toBe(false);
  });
});

describe('vipBadge - dấu hiệu VIP trên card bài và trên trang bài', () => {
  it('bài thường thì không hiện gì, với mọi role', () => {
    for (const role of ROLES) expect(vipBadge(false, role)).toBe('none');
  });

  it('người không mở được thì thấy dấu KHOÁ', () => {
    expect(vipBadge(true, 'user')).toBe('locked');
    expect(vipBadge(true, null)).toBe('locked');
    expect(vipBadge(true, undefined)).toBe('locked');
  });

  it('người có VIP thì thấy dấu hiệu tương ứng, KHÔNG phải dấu khoá', () => {
    // Đây là phần bổ sung so với hành vi cũ: trước đây người có VIP thấy danh
    // sách sạch bóng, nên lướt xong không phân biệt được bài Premium với bài
    // thường. Giấu luôn thì thông tin mất, hiện khoá thì nói dối.
    expect(vipBadge(true, 'vip')).toBe('owned');
    expect(vipBadge(true, 'admin')).toBe('owned');
  });

  it('role lạ (chuỗi rác từ API) thì coi như người thường, tức là thấy khoá', () => {
    expect(vipBadge(true, 'root' as ViewerRole)).toBe('locked');
  });

  it('shouldShowVipLock chỉ là trường hợp riêng của vipBadge — không lệch với nó', () => {
    // Một luật, hai chỗ dùng: `ProblemList` dùng `vipBadge`, còn nếu ai đó viện
    // lý do chỉ cần biết "có khoá không" thì phải ra **cùng** câu trả lời.
    for (const isVip of [true, false]) {
      for (const role of ROLES) {
        expect(shouldShowVipLock(isVip, role)).toBe(vipBadge(isVip, role) === 'locked');
      }
    }
  });
});

describe('isVipLockedError', () => {
  it('nhận đúng mã ổn định do BE trả kèm 403', () => {
    expect(isVipLockedError(403, PROBLEM_VIP_ONLY_CODE)).toBe(true);
  });

  it('403 nhưng mã khác thì không phải màn khoá — phải hiện lỗi tải thật', () => {
    expect(isVipLockedError(403, 'forbidden')).toBe(false);
    expect(isVipLockedError(403, null)).toBe(false);
  });

  it('mã đúng nhưng status khác thì không phải màn khoá', () => {
    expect(isVipLockedError(404, PROBLEM_VIP_ONLY_CODE)).toBe(false);
    expect(isVipLockedError(500, PROBLEM_VIP_ONLY_CODE)).toBe(false);
  });
});

describe('vipLockHref', () => {
  it('luôn trỏ tới trang bảng giá có nút mua', () => {
    expect(vipLockHref('trapping-rain-water')).toBe('/premium');
  });

  it('không nhét slug bài vào URL — URL premium là hằng số', () => {
    // slug trong query là thứ tự người dùng kiểm soát; đưa vào link mà không
    // mã hoá là mở đường cho link giả (open redirect giả dạng nút nâng cấp).
    expect(vipLockHref('a b/../c')).toBe('/premium');
  });
});
