import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { ProblemsService } from './problems.service.ts';
import { AdminService } from '../admin/admin.service.ts';
import {
  PROBLEM_LIST_TTL_MS,
  PROBLEM_SLUG_TTL_MS,
  createLocalCache,
} from '../common/cache.config.ts';
import { PROBLEM_VIP_ONLY_CODE } from './vip-problem.policy.ts';

/**
 * Bài VIP có **mô tả đầy đủ**. Hai chuỗi này là "ngọn cờ đỏ": nếu chúng xuất hiện
 * trong bất kỳ thứ gì người thường nhận được (kết quả trả về, body của lỗi 403)
 * thì đó là rò nội dung bài.
 */
const VIP_DESCRIPTION = 'NOI_DUNG_DE_BAI_VIP';
const VIP_STARTER = 'STARTER_CODE_VIP';

const vipRow = {
  slug: 'trapping-rain-water',
  title: 'Hứng nước mưa',
  difficulty: 'Khó',
  topic: 'array',
  status: 'published',
  description: VIP_DESCRIPTION,
  inputFormat: 'DONG_1_LA_CHUOI',
  outputFormat: 'IN_RA_SO',
  constraints: ['n <= 10^5'],
  examples: [{ input: '[[1,0]]', output: '1' }],
  tests: [{ stdin: '[[1,0]]', expected: '1' }],
  hiddenTests: [{ stdin: '[[2,1]]', expected: '1' }],
  starterCodes: { '71': VIP_STARTER },
  isVip: true,
};
const normalRow = {
  slug: 'two-sum',
  title: 'Hai số có tổng bằng mục tiêu',
  difficulty: 'Dễ',
  topic: 'array',
  status: 'published',
  description: 'NOI_DUNG_DE_BAI_THUONG',
  inputFormat: '',
  outputFormat: '',
  constraints: [],
  examples: [],
  tests: [{ stdin: '1', expected: '2' }],
  hiddenTests: [{ stdin: '2', expected: '3' }],
  isVip: false,
};

/** Bài đã publish, không VIP — dùng cho các test chỉ về hành vi cache. */
const published = {
  slug: 'a',
  title: 'Bài A',
  status: 'published',
  description: 'NOI_DUNG_DE_BAI_THUONG',
  isVip: false,
  hiddenTests: [{ stdin: 'x', expected: 'y' }],
};

function makeService(overrides?: { problem?: unknown; problems?: unknown[] }) {
  const db = {
    problem: {
      findMany: vi.fn().mockResolvedValue(overrides?.problems ?? []),
      findUnique: vi.fn().mockResolvedValue(overrides?.problem ?? null),
    },
    submission: { create: vi.fn().mockResolvedValue({ id: 's1' }) },
    solvedProblem: { upsert: vi.fn().mockResolvedValue({}) },
    activityDay: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const judge0 = {
    createBatchSubmissions: vi.fn().mockResolvedValue([]),
    getBatchSubmissions: vi.fn(),
  };
  const svc = new ProblemsService(db as any, judge0 as any);
  return { svc, db, judge0 };
}

/** Bắt lỗi trả về, để assert được cả "có ném lỗi" lẫn "không ném". */
async function catchErr(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return e;
  }
}

/* ==================================================================
 * HỒI QUY NGUY HIỂM NHẤT khi đụng cache của bài tập: bài VIP có lọt
 * mô tả qua cache không.
 * ==================================================================
 *
 * `findBySlug`/`findAll` cắt theo role **ở mỗi lần gọi**, còn cache giữ dữ liệu
 * trung tính (đã bỏ `hiddenTests`, **chưa** cắt). Nên nơi duy nhất chặn được bài VIP
 * khi dữ liệu đến từ cache là dòng
 * `assertVipProblemAllowed(readIsVipFlag(hit['isVip']), role)` ngay sau khi đọc hit.
 * Xoá đúng dòng đó thì:
 *
 *   1. người VIP mở bài → dòng đầy đủ (kèm `isVip: true`) nằm trong cache;
 *   2. người thường gọi cùng slug → đọc trúng cache đó → **mô tả đầy đủ rò ra**,
 *      trong khi nếu đọc DB thì đã bị chặn.
 *
 * Vì vậy các test dưới đây không được xoá hay nới: chúng là lớp bảo vệ duy nhất
 * cho đúng đường này. Cả hai chiều đều phải đỏ nếu dòng assert biến mất.
 */
describe('VIP không lọt mô tả qua cache — findBySlug', () => {
  it('người thường bị chặn kể cả khi bài đã nằm sẵn trong cache', async () => {
    const { svc, db } = makeService({ problem: vipRow });

    // Người VIP mở trước → bản đầy đủ được ghi vào cache.
    const vipDoc = await svc.findBySlug('trapping-rain-water', 'vip');
    expect(vipDoc).toHaveProperty('description', VIP_DESCRIPTION);
    await svc.findBySlug('trapping-rain-water', 'vip');

    // Chứng minh dữ liệu **đang nằm trong cache**, không phải đọc DB mỗi lần.
    // Thiếu dòng này thì test có thể xanh chỉ vì DB trả về đúng.
    expect(db.problem.findUnique).toHaveBeenCalledOnce();

    // Người thường tới sau: phải bị chặn, và không có đường nào lấy được mô tả.
    for (const role of ['user', undefined] as const) {
      const err = await catchErr(() => svc.findBySlug('trapping-rain-water', role));
      expect(err, `role=${String(role)} phải bị chặn, không được trả đề VIP`).toBeInstanceOf(
        ForbiddenException,
      );
      const body = (err as ForbiddenException).getResponse();
      expect(body).toMatchObject({ code: PROBLEM_VIP_ONLY_CODE });
      const chuoi = JSON.stringify(body);
      expect(chuoi).not.toContain(VIP_DESCRIPTION);
      expect(chuoi).not.toContain(VIP_STARTER);
    }

    // Người có VIP vẫn đọc được sau cùng cache đó — chứng minh chặn là do cờ VIP
    // của bài, không phải do cache hỏng.
    expect(await svc.findBySlug('trapping-rain-water', 'admin')).toHaveProperty(
      'description',
      VIP_DESCRIPTION,
    );
  });

  it('bài VIP đọc từ cache không bao giờ kèm hiddenTests, kể cả với người VIP', async () => {
    const { svc } = makeService({ problem: vipRow });
    await svc.findBySlug('trapping-rain-water', 'vip');
    expect(await svc.findBySlug('trapping-rain-water', 'vip')).not.toHaveProperty('hiddenTests');
  });

  it('người thường bị chặn cả khi không ai nạp cache trước (đường DB)', async () => {
    const { svc, db } = makeService({ problem: vipRow });
    const err = await catchErr(() => svc.findBySlug('trapping-rain-water', 'user'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: PROBLEM_VIP_ONLY_CODE,
    });
    // Bị chặn thì **không được** ghi vào cache: nếu ghi, lần sau người thường đi qua
    // nhánh cache và lộ mô tả. Đây là lý do `assert` nằm trước `cache.set`.
    expect(db.problem.findUnique).toHaveBeenCalledOnce();
  });
});

describe('VIP không lọt mô tả qua cache — findAll', () => {
  it('danh sách trong cache không lộ mô tả bài VIP cho người thường', async () => {
    const { svc, db } = makeService({ problems: [vipRow, normalRow] });

    // Người VIP nạp danh sách trước (được mô tả đầy đủ) → cache có bản trung tính.
    const vipXem = await svc.findAll('vip');
    expect(vipXem.find((r) => r['slug'] === 'trapping-rain-water')).toHaveProperty(
      'description',
      VIP_DESCRIPTION,
    );
    await svc.findAll('vip');
    // Chứng minh đang đọc cache: DB không được gọi lần thứ hai.
    expect(db.problem.findMany).toHaveBeenCalledOnce();

    // Người thường đọc **cùng** entry cache đó.
    const khach = await svc.findAll('user');
    const chuoi = JSON.stringify(khach);
    expect(chuoi).not.toContain(VIP_DESCRIPTION);
    expect(chuoi).not.toContain(VIP_STARTER);

    // Bài VIP vẫn phải hiện trong danh sách (tiêu đề công khai + cờ khoá).
    const oVip = khach.find((r) => r['slug'] === 'trapping-rain-water')!;
    expect(oVip).toMatchObject({ isVip: true, title: 'Hứng nước mưa' });
    expect(Object.keys(oVip).sort()).toEqual(['difficulty', 'isVip', 'slug', 'title', 'topic']);

    // Bài thường trong cùng danh sách không bị cắt nhầm.
    expect(khach.find((r) => r['slug'] === 'two-sum')).toHaveProperty(
      'description',
      'NOI_DUNG_DE_BAI_THUONG',
    );
  });

  it('khách nạp trước cũng không làm người VIP mất mô tả', async () => {
    const { svc } = makeService({ problems: [vipRow] });
    expect(JSON.stringify(await svc.findAll())).not.toContain(VIP_DESCRIPTION);
    expect((await svc.findAll('vip'))[0]).toHaveProperty('description', VIP_DESCRIPTION);
  });
});

describe('cache hit: lần hai không gọi DB', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('findBySlug gọi DB đúng một lần trong TTL 300s', async () => {
    const { svc, db } = makeService({ problem: published });
    await svc.findBySlug('a');
    await svc.findBySlug('a');
    await svc.findBySlug('a');
    expect(db.problem.findUnique).toHaveBeenCalledOnce();
  });

  it('findAll gọi DB đúng một lần trong TTL 60s', async () => {
    const { svc, db } = makeService({ problems: [published] });
    await svc.findAll();
    await svc.findAll();
    expect(db.problem.findMany).toHaveBeenCalledOnce();
  });

  it('mỗi slug một entry riêng — slug này không đọc trúng slug khác', async () => {
    const { svc, db } = makeService({ problem: published });
    await svc.findBySlug('a');
    await svc.findBySlug('b');
    expect(db.problem.findUnique).toHaveBeenCalledTimes(2);
  });

  it('danh sách là cache chung cho mọi role, nhưng cắt theo từng lần gọi', async () => {
    const { svc, db } = makeService({ problems: [published] });
    await svc.findAll('user');
    await svc.findAll('vip');
    await svc.findAll('admin');
    expect(db.problem.findMany).toHaveBeenCalledOnce();
  });
});

describe('TTL đúng như khai báo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('findBySlug còn hit ở TTL-1ms và miss đúng tại mốc TTL', async () => {
    expect(PROBLEM_SLUG_TTL_MS).toBe(300_000);
    const { svc, db } = makeService({ problem: published });
    await svc.findBySlug('a');

    vi.advanceTimersByTime(PROBLEM_SLUG_TTL_MS - 1);
    await svc.findBySlug('a');
    expect(db.problem.findUnique).toHaveBeenCalledOnce();

    // Đúng tại mốc TTL là phải miss. `keyv` hết hạn khi `now > expires` (lệch 1ms so
    // với `>=` của `TtlCache` cũ), nên `cache.config.ts` bù trừ 1ms — thay vì nới
    // test này cho vừa.
    vi.advanceTimersByTime(1);
    await svc.findBySlug('a');
    expect(db.problem.findUnique).toHaveBeenCalledTimes(2);
  });

  it('findAll còn hit ở TTL-1ms và miss đúng tại mốc TTL', async () => {
    expect(PROBLEM_LIST_TTL_MS).toBe(60_000);
    const { svc, db } = makeService({ problems: [published] });
    await svc.findAll();

    vi.advanceTimersByTime(PROBLEM_LIST_TTL_MS - 1);
    await svc.findAll();
    expect(db.problem.findMany).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1);
    await svc.findAll();
    expect(db.problem.findMany).toHaveBeenCalledTimes(2);
  });

  it('không cache null: bài draft vừa publish là thấy ngay ở request kế tiếp', async () => {
    const { svc, db } = makeService({ problem: null });
    await expect(svc.findBySlug('a')).resolves.toBeNull();
    await expect(svc.findBySlug('a')).resolves.toBeNull();
    expect(db.problem.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateProblemCache: sau đó lần gọi kế phải đọc DB', () => {
  it('xoá cả entry chi tiết lẫn entry danh sách', async () => {
    const { svc, db } = makeService({ problem: published, problems: [published] });

    await svc.findBySlug('a');
    await svc.findAll();
    expect(db.problem.findUnique).toHaveBeenCalledOnce();
    expect(db.problem.findMany).toHaveBeenCalledOnce();

    await svc.invalidateProblemCache('a');

    await svc.findBySlug('a');
    await svc.findAll();
    expect(db.problem.findUnique).toHaveBeenCalledTimes(2);
    expect(db.problem.findMany).toHaveBeenCalledTimes(2);
  });

  it('xoá cache của bài này thì bài khác không bị ảnh hưởng', async () => {
    const { svc, db } = makeService({ problem: published });
    await svc.findBySlug('a');
    await svc.invalidateProblemCache('b'); // slug chưa từng có trong cache
    await svc.findBySlug('a');
    expect(db.problem.findUnique).toHaveBeenCalledOnce();
  });
});

/**
 * Khoá bài VIP phải có hiệu lực **ngay**, không chờ hết TTL 5 phút — đó là lý do
 * `invalidateProblemCache` tồn tại. Dựng `AdminService` thật trên `ProblemsService`
 * thật (không stub policy, xem lý do ở `admin.service.vip.spec.ts`).
 */
describe('admin bật/tắt cờ VIP thì khoá có hiệu lực ngay, không cần chờ TTL', () => {
  type Row = Record<string, unknown> & { slug: string; isVip: boolean };

  /** Bảng `Problem` là một `Map` nên chính là nơi `AdminService` ghi cờ. */
  function fakeDb(rows: Row[]) {
    const bang = new Map(rows.map((r) => [r.slug, { ...r }]));
    return {
      bang,
      db: {
        problem: {
          findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
            const hit = bang.get(where.slug);
            return hit ? { ...hit } : null;
          }),
          update: vi.fn(
            async ({ where, data }: { where: { slug: string }; data: { isVip: boolean } }) => {
              const cur = bang.get(where.slug);
              if (!cur) throw Object.assign(new Error('P2025'), { code: 'P2025' });
              const next = { ...cur, ...data };
              bang.set(where.slug, next);
              return { ...next };
            },
          ),
          findMany: vi.fn(async () => [...bang.values()].map((r) => ({ ...r }))),
        },
        submission: { findMany: vi.fn(async () => []), create: vi.fn(async () => ({ id: 1 })) },
        solvedProblem: { upsert: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
        activityDay: { findMany: vi.fn(async () => []) },
        userBadge: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({})) },
      },
    };
  }

  const BAI_THUONG: Row = {
    slug: 'bai-01',
    title: 'Bài 1',
    difficulty: 'Dễ',
    topic: 'array',
    status: 'published',
    isVip: false,
    description: 'NOI_DUNG_DAY_DU_HAI_CHU_THAT',
    examples: [{ input: '1', output: '1' }],
    tests: [],
    hiddenTests: [],
  };

  function dung() {
    const { bang, db } = fakeDb([BAI_THUONG]);
    const problems = new ProblemsService(db as any, {} as any);
    const admin = new AdminService(db as any, undefined, problems);
    return { bang, db, problems, admin };
  }

  it('nạp cache đầy đủ trước, admin khoá, rồi người thường không còn đọc được đề', async () => {
    const { bang, problems, admin } = dung();

    // Người thường đọc trước khi khoá → cache chứa bản đầy đủ (kể cả `isVip: false`).
    const doc = await problems.findBySlug('bai-01', 'user');
    expect(doc!['description']).toBe('NOI_DUNG_DAY_DU_HAI_CHU_THAT');
    expect((await problems.findAll('user'))[0]!['description']).toBe(
      'NOI_DUNG_DAY_DU_HAI_CHU_THAT',
    );

    await admin.setProblemVip('bai-01', true);
    expect(bang.get('bai-01')!.isVip).toBe(true);

    // Ngay lập tức, không tick thêm một mili-giây nào.
    const err = await catchErr(() => problems.findBySlug('bai-01', 'user'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      code: PROBLEM_VIP_ONLY_CODE,
    });
    expect(JSON.stringify((err as ForbiddenException).getResponse())).not.toContain(
      'NOI_DUNG_DAY_DU',
    );

    const sau = await problems.findAll('user');
    expect(Object.keys(sau[0]!).sort()).toEqual(['difficulty', 'isVip', 'slug', 'title', 'topic']);
    expect(JSON.stringify(sau)).not.toContain('NOI_DUNG_DAY_DU');

    // Người có VIP vẫn đọc được: cờ của bài không liên quan hạ VIP của user.
    expect((await problems.findAll('vip'))[0]!['description']).toBe(
      'NOI_DUNG_DAY_DU_HAI_CHU_THAT',
    );
  });

  it('gỡ cờ thì bài mở lại ngay — không để cache cũ chặn nhầm bài đã mở khoá', async () => {
    const { problems, admin } = dung();

    await admin.setProblemVip('bai-01', true);
    await expect(problems.findBySlug('bai-01', 'user')).rejects.toBeTruthy();
    await admin.setProblemVip('bai-01', false);

    // Không có `invalidateProblemCache` thì dòng này đỏ: cache còn giữ
    // `isVip: true` và người thường bị chặn nhầm một bài đã mở khoá.
    expect((await problems.findBySlug('bai-01', 'user'))!['description']).toBe(
      'NOI_DUNG_DAY_DU_HAI_CHU_THAT',
    );
    expect((await problems.findAll('user'))[0]!['description']).toBe(
      'NOI_DUNG_DAY_DU_HAI_CHU_THAT',
    );
  });

  /**
   * `cache-manager` xoá bất đồng bộ. Nếu `AdminService.setProblemVip` gọi
   * `invalidateProblemCache` mà **không** `await`, nó sẽ trả lời admin trước khi
   * cache kịp sạch — và với store dùng chung (Vercel KV/Redis) request thường gửi
   * ngay sau đó vẫn lấy được đề VIP.
   *
   * Store ở đây cố tình **trễ** `mdel` qua một macrotask. Với store in-memory thì
   * lệnh xoá rơi vào microtask nên thường "tình cờ" đúng; store trễ làm lộ ra đúng
   * lỗi: cờ `daXoa` phải đã bật **trước** khi `setProblemVip` resolve. Bỏ `await`
   * ở `admin.service.ts` thì dòng `expect(daXoa).toBe(true)` này đỏ.
   */
  it('setProblemVip chỉ resolve sau khi cache đã xoá xong', async () => {
    const { db } = fakeDb([BAI_THUONG]);
    let daXoa = false;

    const that = createLocalCache();
    const tre: Cache = {
      ...that,
      mdel: async (keys: string[]) => {
        await new Promise((r) => setTimeout(r, 0));
        daXoa = true;
        return that.mdel(keys);
      },
    };

    const problems = new ProblemsService(db as any, {} as any, tre);
    const admin = new AdminService(db as any, undefined, problems);

    await problems.findBySlug('bai-01', 'user'); // nạp cache trước
    await admin.setProblemVip('bai-01', true);

    expect(daXoa).toBe(true);
    await expect(problems.findBySlug('bai-01', 'user')).rejects.toMatchObject({
      response: { code: PROBLEM_VIP_ONLY_CODE },
    });
  });
});