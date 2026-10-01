import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { AppModule } from '../app.module.ts';
import { ProblemsModule } from '../problems/problems.module.ts';
import { ProblemsService } from '../problems/problems.service.ts';
import { ProgressModule } from '../progress/progress.module.ts';
import { ProgressService } from '../progress/progress.service.ts';
import { Judge0Service } from '../judge0/judge0.service.ts';
import { DatabaseService } from '../database/database.service.ts';
import {
  CACHE_NS,
  DASHBOARD_TTL_MS,
  DEFAULT_CACHE_TTL_MS,
  PROBLEM_LIST_TTL_MS,
  PROBLEM_SLUG_TTL_MS,
  cacheStoreTtl,
  createLocalCache,
  dashboardKey,
  problemListKey,
  problemSlugKey,
} from './cache.config.ts';

/**
 * ============================================================
 * Cache đi qua `@nestjs/cache-manager`, không còn `Map` tự viết
 * ============================================================
 *
 * Bốn phần:
 *  1. **TTL** — hằng số ở `cache.config.ts` khớp đúng hành vi cache đã gỡ.
 *  2. **Namespace key** — mỗi nhóm cache một tiền tố riêng, không đụng nhau.
 *  3. **Phép bù 1ms** — `keyv` hết hạn khi `now > expires`, `TtlCache` cũ dùng
 *     `now >= expiresAt`. Bù để mốc hết hạn khớp, thay vì nới test.
 *  4. **Wiring thật** — Nest phải thật sự inject `CACHE_MANAGER` vào service.
 *     `tsc` không bắt được lỗi DI, đó là lỗi runtime.
 */
describe('TTL khai báo — khớp đúng hành vi cache cũ', () => {
  it('TTL từng cache không đổi so với TtlCache đã gỡ', () => {
    expect(PROBLEM_LIST_TTL_MS).toBe(60_000); // listCache từng dùng 60_000
    expect(PROBLEM_SLUG_TTL_MS).toBe(300_000); // slugCache từng dùng 300_000
    expect(DASHBOARD_TTL_MS).toBe(300_000); // dashboardCache từng dùng 300_000
  });

  it('TTL mặc định của CacheModule là 60s — lưới an toàn, không phải giá trị dài nhất', () => {
    expect(DEFAULT_CACHE_TTL_MS).toBe(60_000);
    expect(DEFAULT_CACHE_TTL_MS).toBe(PROBLEM_LIST_TTL_MS);
    expect(DEFAULT_CACHE_TTL_MS).toBeLessThan(PROBLEM_SLUG_TTL_MS);
  });
});

describe('namespace key', () => {
  it('tiền tố theo service, đủ để hai nhóm cache không đụng nhau', () => {
    expect(CACHE_NS.problems).toBe('gocode:problems');
    expect(CACHE_NS.progress).toBe('gocode:progress');
    expect(problemListKey()).toBe('gocode:problems:list');
    expect(problemSlugKey('bai-01')).toBe('gocode:problems:slug:bai-01');
    expect(dashboardKey(7)).toBe('gocode:progress:dashboard:7');
  });

  it('slug trùng tên với key khác vẫn không đè lên nhau', () => {
    expect(problemSlugKey('list')).not.toBe(problemListKey());
    // slug chứa `:` vẫn là key riêng, không đụng slug khác.
    expect(problemSlugKey('a:b')).not.toBe(problemSlugKey('a'));
  });

  it('dashboard khoá theo userId — không user nào nhận dữ liệu của user khác', () => {
    expect(dashboardKey(1)).not.toBe(dashboardKey(2));
  });

  it('xoá key của problems không đụng key của progress trên cùng store', async () => {
    const c = createLocalCache();
    await c.set(problemSlugKey('bai-01'), 'de-bai', cacheStoreTtl(1000));
    await c.set(dashboardKey(1), 'dashboard', cacheStoreTtl(1000));

    await c.mdel([problemSlugKey('bai-01')]);

    expect(await c.get(problemSlugKey('bai-01'))).toBeUndefined();
    expect(await c.get(dashboardKey(1))).toBe('dashboard');
  });
});

describe('phép bù 1ms cho quy ước hết hạn của keyv', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cacheStoreTtl trừ đúng 1ms', () => {
    expect(cacheStoreTtl(60_000)).toBe(59_999);
    expect(cacheStoreTtl(200)).toBe(199);
  });

  it('entry sống tới đúng mốc TTL rồi chết — khớp TtlCache (>= expiresAt)', async () => {
    const c = createLocalCache();
    const ttl = PROBLEM_LIST_TTL_MS;
    await c.set('k', 'v', cacheStoreTtl(ttl));

    vi.advanceTimersByTime(ttl - 1);
    expect(await c.get('k')).toBe('v');

    // Tới đúng mốc TTL là phải miss. Không có phép bù này thì `keyv` sống tới
    // `ttl` và dòng dưới xanh — tức test mất tác dụng ghim mốc hết hạn.
    vi.advanceTimersByTime(1);
    expect(await c.get('k')).toBeUndefined();
  });

  it('entry hết hạn bị xoá thật, không chỉ bị coi là không có', async () => {
    const c = createLocalCache();
    await c.set('het-han', 'cu', cacheStoreTtl(50));
    vi.advanceTimersByTime(51);
    expect(await c.get('het-han')).toBeUndefined();

    // Ghi đè sau khi hết hạn phải sạch. Nếu entry chết vẫn nằm trong store thì lần
    // ghi này bị bỏ qua và `get` trả về giá trị cũ.
    await c.set('het-han', 'moi', cacheStoreTtl(1000));
    expect(await c.get('het-han')).toBe('moi');
  });
});

/**
 * Wiring thật. `CacheModule.register({ isGlobal: true })` nằm ở `app.module.ts`,
 * còn `ProblemsService`/`ProgressService` inject `@Optional() @Inject(CACHE_MANAGER)`.
 *
 * Nếu ai đó gỡ `CacheModule` khỏi `AppModule` thì các test service dựng tay **vẫn
 * xanh** (chúng tự dựng cache qua `createLocalCache()`), còn production thì mỗi
 * service có một kho riêng. Vì vậy phải có test riêng cho chỗ nối này — y hệt lý do
 * `auth.module.spec.ts` tồn tại.
 */
describe('CacheModule được nối vào AppModule', () => {
  const imports = (Reflect.getMetadata('imports', AppModule) ?? []) as unknown[];
  const dyn = imports.find(
    (m) => m && typeof m === 'object' && (m as { module?: unknown }).module === CacheModule,
  ) as { global?: boolean; providers?: { provide?: string; useValue?: unknown }[] } | undefined;

  it('AppModule import CacheModule.register(...)', () => {
    expect(dyn).toBeDefined();
  });

  it('đăng ký global — ProblemsService và ProgressService ở hai module khác nhau cùng thấy một kho', () => {
    expect(dyn!.global).toBe(true);
  });

  it('TTL mặc định truyền vào đúng bằng DEFAULT_CACHE_TTL_MS đã bù', () => {
    const options = (dyn!.providers ?? []).find((p) => p.useValue !== undefined)?.useValue as
      | { ttl?: number; isGlobal?: boolean }
      | undefined;
    expect(options).toBeDefined();
    expect(options!.ttl).toBe(cacheStoreTtl(DEFAULT_CACHE_TTL_MS));
    expect(options!.isGlobal).toBe(true);
  });

  /**
   * `CacheModule.register()` chỉ trả về `DynamicModule` mang **options**; provider
   * `CACHE_MANAGER` nằm trong decorator `@Module` tĩnh của chính `CacheModule`.
   * Nên phải đọc metadata của `CacheModule` chứ không đọc `dyn.providers`.
   */
  it('CacheModule cấp và export token CACHE_MANAGER', () => {
    const providers = (Reflect.getMetadata('providers', CacheModule) ?? []) as { provide: string }[];
    const exports_ = (Reflect.getMetadata('exports', CacheModule) ?? []) as string[];
    expect(providers.map((p) => p.provide)).toContain(CACHE_MANAGER);
    expect(exports_).toContain(CACHE_MANAGER);
  });
});

/**
 * `compile()` giải dependency thật — đó là lúc Nest ném lỗi DI nếu token sai.
 * `overrideProvider(DatabaseService)` để không có connection nào ra ngoài khi
 * `pnpm test` (giống `auth.module.spec.ts`).
 */
async function compileModules(extraProviders: Record<string, unknown> = {}) {
  const findMany = vi.fn().mockResolvedValue([]);
  const m = await Test.createTestingModule({
    imports: [
      CacheModule.register({ isGlobal: true, ttl: cacheStoreTtl(DEFAULT_CACHE_TTL_MS) }),
      ProblemsModule,
      ProgressModule,
    ],
  })
    .overrideProvider(DatabaseService)
    .useValue({ problem: { findMany, findUnique: vi.fn().mockResolvedValue(null) } })
    .overrideProvider(Judge0Service)
    .useValue(extraProviders.judge0 ?? {})
    .compile();
  return { m, findMany };
}

describe('service nhận CACHE_MANAGER qua DI thật', () => {
  it('CacheModule cấp một cache dùng được', async () => {
    const m = await Test.createTestingModule({
      imports: [CacheModule.register({ isGlobal: true, ttl: cacheStoreTtl(DEFAULT_CACHE_TTL_MS) })],
    }).compile();
    const cache = m.get<Cache>(CACHE_MANAGER);
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.set).toBe('function');
    expect(typeof cache.mdel).toBe('function');
    await m.close();
  });

  it('ProblemsModule + ProgressModule giải được khi có CacheModule global', async () => {
    const { m } = await compileModules();
    expect(m.get(ProblemsService)).toBeInstanceOf(ProblemsService);
    expect(m.get(ProgressService)).toBeInstanceOf(ProgressService);
    // `AdminModule` phụ thuộc `ProblemsService` để xoá cache sau khi admin đổi cờ
    // VIP — chứng minh nó vẫn được export khỏi `ProblemsModule` sau khi đổi cache.
    await m.close();
  });

  it('findAll hai lần thì chỉ query DB một lần — qua đường DI thật', async () => {
    const { m, findMany } = await compileModules();
    const svc = m.get(ProblemsService);
    await svc.findAll();
    await svc.findAll();
    expect(findMany).toHaveBeenCalledOnce();
    await m.close();
  });

  it('invalidateProblemCache xoá đúng entry mà service vừa ghi, qua đường DI thật', async () => {
    const { m, findMany } = await compileModules();
    const svc = m.get(ProblemsService);
    const cache = m.get<Cache>(CACHE_MANAGER);

    await svc.findAll();
    expect(await cache.get(problemListKey())).toBeDefined();

    await svc.invalidateProblemCache('bai-01');
    expect(await cache.get(problemListKey())).toBeUndefined();

    await svc.findAll();
    expect(findMany).toHaveBeenCalledTimes(2);
    await m.close();
  });
});