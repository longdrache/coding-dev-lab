import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DatabaseService } from '../database/database.service.ts';
import { Judge0Service } from '../judge0/judge0.service.ts';
import {
  PROBLEM_LIST_TTL_MS,
  PROBLEM_SLUG_TTL_MS,
  cacheStoreTtl,
  createLocalCache,
  problemListKey,
  problemSlugKey,
} from '../common/cache.config.ts';
import type { UserRole } from '../auth/auth.types.ts';
import {
  assertVipProblemAllowed,
  canAccessVipProblems,
  readIsVipFlag,
  redactVipListRow,
} from './vip-problem.policy.ts';

type PublicProblem = Record<string, unknown>;

// TTL và namespace không khai ở đây nữa — xem `common/cache.config.ts`. Danh sách
// đổi thường xuyên hơn (bài mới publish) nên TTL ngắn; chi tiết bài gần như bất
// biến nên để lâu. Không có invalidation thủ công cho mọi bài: admin sửa xong tối
// đa phải chờ TTL mới thấy — riêng cờ VIP thì bắt buộc xoá ngay (xem
// `invalidateProblemCache`).

function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

function rawOutputOf(s: Record<string, unknown>): string {
  return (
    (s['compile_output'] as string) ??
    (s['stderr'] as string) ??
    (s['message'] as string) ??
    (s['stdout'] as string) ??
    ''
  );
}

@Injectable()
export class ProblemsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly judge0: Judge0Service,
    /**
     * Cache nội dung do `@nestjs/cache-manager` quản lý.
     *
     * `@Optional` vì lý do đã ghi ở `problems.module.ts`: có những test dựng
     * service bằng `new ProblemsService(db, judge0)` (hai tham số). Bỏ `@Optional`
     * vào sẽ phải sửa hàng chục lời gọi trong test để lấy cache từ đâu đó, và
     * mất tác dụng của việc test tự dựng service. Khi thiếu DI thì tự tạo cache
     * in-memory cùng loại — **hành vi cache y hệt**, chỉ khác chỗ quản lý.
     */
    @Optional()
    @Inject(CACHE_MANAGER)
    cache?: Cache,
  ) {
    this.cache = cache ?? createLocalCache();
  }

  private readonly cache: Cache;

  /**
   * Danh sách bài đã publish.
   *
   * Payload **phụ thuộc người gọi**: `role` trong access token quyết định bài VIP
   * có bị cắt còn catalogue không. Người có VIP nhận mô tả đầy đủ — cùng hình
   * dạng với `findBySlug`, chỉ khác ở chỗ danh sách không bao giờ có
   * `hiddenTests`, kể cả với VIP. Người không có VIP chỉ nhận allowlist.
   *
   * Cột quyết định vẫn là claim đã ký trong token, không đọc `vipExpiresAt` ở
   * đây — xem `vip-problem.policy.ts`.
   */
  // Public: chỉ bài đã xuất bản mới hiện cho user
  async findAll(role?: UserRole | null): Promise<PublicProblem[]> {
    // Cache giữ dòng đã bỏ `hiddenTests` nhưng **chưa** cắt theo role.

    let rows = await this.cache.get<PublicProblem[]>(problemListKey());

    // yield để test `cache.spec.ts` có thể set cache trước khi đọc
    if (!rows) {
      const raw = await this.db.problem.findMany({
        where: { status: 'published' },
        orderBy: { createdAt: 'asc' },
      });
      // ẩn hiddenTests với client
      rows = raw.map((row) => {
        const { id,slug, title,difficulty,topic,isVip} = row as Record<string, unknown>;
        return { id,slug, title,difficulty,topic,isVip};
      });
      await this.cache.set(problemListKey(), rows, cacheStoreTtl(PROBLEM_LIST_TTL_MS));
  }
  // Cắt **theo lần gọi**, không theo lúc nạp cache. Nếu cache lưu kết quả
  // đã cắt thì một người VIP gọi trước sẽ làm khách gọi sau nhận bản đầy;
  // nếu cache lưu bản đầu thì ngược lại, khách gọi trước làm VIP mất mô tả
  // giữa chừng. Cắt ở đây thì cache chỉ chứa dữ liệu trung tính và mỗi lần
  // gọi tự quyết theo role của chính nó.
  const docVip = canAccessVipProblems(role);
    return rows.map((row) =>
    readIsVipFlag(row['isVip']) && !docVip ? redactVipListRow(row) : row,
  );
  }

  /**
   * Chi tiết một bài. Bài VIP thì chỉ `vip`/`admin` mới đọc được — `role` lấy từ
   * claim trong access token, xem `vip-problem.policy.ts`.
   */
  async findBySlug(slug: string, role ?: UserRole | null): Promise < PublicProblem | null > {
  const hit = await this.cache.get<PublicProblem>(problemSlugKey(slug));
  if(hit) {
    // Chặn **trước** khi trả, kể cả khi dữ liệu đến từ cache: bản cache giữ
    // nguyên cột `isVip`, nên đây là điểm quyết định duy nhất chặn được bài vừa
    // khoá mà `findUnique` còn trả về `isVip: false` cũ. Bỏ dòng này thì người
    // thường đọc được đề VIP trong suốt TTL — xem `problems.cache.spec.ts`.
    assertVipProblemAllowed(readIsVipFlag(hit['isVip']), role);
    return hit;
  }
    const row = await this.db.problem.findUnique({ where: { slug } });
  if(!row || (row as Record<string, unknown>).status !== 'published') return null;
// Chặn **trước** khi cắt `hiddenTests` và trước khi đụng cache: dòng đầy đủ
// của bài VIP không được đi qua bất kỳ đường trả về nào với người thường.
assertVipProblemAllowed(readIsVipFlag((row as Record<string, unknown>)['isVip']), role);
const { hiddenTests: _hiddenTests, ...rest } = row as Record<string, unknown>;
// Không cache null: bài vừa publish sẽ thấy ngay ở request kế tiếp
// thay vì phải chờ hết TTL.
await this.cache.set(problemSlugKey(slug), rest, cacheStoreTtl(PROBLEM_SLUG_TTL_MS));
return rest;
  }

  /**
   * Xoá cache của một bài sau khi admin sửa nó.
   *
   * Bắt buộc, không phải tối ưu: cache ở đây giữ **cả cột `isVip`**, và
   * `findBySlug` chấn chấn bằng `hit['isVip']` (xem dòng assert bên trên). Nên nếu
   * admin bật cờ VIP cho một bài mà dòng đầy đủ của nó đang nằm trong cache
   * `problems:slug:<slug>`, thì tới hết TTL (5 phút) mọi người vẫn đọc được đề bài
   * đó — đúng lỗi rò nội dung VIP mà `problem_vip_only` sinh ra để chặn. TTL là
   * biện pháp tạm thời cho dữ liệu gần như bất biến, không phải lưới an toàn;
   * khoá bài thì phải có hiệu lực ngay.
   *
   * Key danh sách xoá luôn vì danh sách chứa cột `isVip` của **mọi** bài, nên đổi
   * cờ của một bài làm cả danh sách cũ.
   *
   * `mdel` xoá cả hai key trong **một** lệnh thay vì hai lần `del`. Không chỉ để
   * gọn: `cache-manager` là API bất đồng bộ, nên nếu hai lần `del` rời rạc thì
   * có khoảng thời gian danh sách đã sạch còn chi tiết thì chưa, và request đúng
   * khoảng giữa đó vẫn lấy được đề. `mdel` chỉ resolve khi cả hai đã xoá xong —
   * đó là điều kiện để `AdminService.setProblemVip` `await` được và trả lời
   * sau khi cache đã sạch thật.
   */
  async invalidateProblemCache(slug: string): Promise < void> {
  await this.cache.mdel([problemSlugKey(slug), problemListKey()]);
}

  async submit(
  slug: string,
  userId: number,
  languageId: number,
  sourceCode: string,
  role ?: UserRole | null,
) {
  const problem = await this.db.problem.findUnique({ where: { slug } });
  if (!problem) throw new NotFoundException('Không tìm thấy bài toán');
  // Chặn ngay sau khi biết bài là VIP và **trước** khi đọc `hiddenTests`, trước
  // khi gọi Judge0: nếu chặn muộn thì một lần submit trôi qua đã tiêu tài nguyên
  // máy chấm và đã lộ test ẩn qua thông báo lỗi phía dưới.
  assertVipProblemAllowed(readIsVipFlag((problem as Record<string, unknown>)['isVip']), role);
  const hiddenTests = (problem.hiddenTests as Array<{ stdin: string; expected: string }>) ?? [];
  if (hiddenTests.length === 0) throw new NotFoundException('Bài toán chưa có test ẩn');
  if (hiddenTests.length > 10) throw new NotFoundException('Quá nhiều test ẩn');

  const batch = await this.judge0.createBatchSubmissions(
    hiddenTests.map((t) => ({
      language_id: languageId,
      source_code: sourceCode,
      stdin: t.stdin,
    })),
  ) as Array<{ token: string }>;
  const tokens: string[] = batch.map((b) => b.token);

  const started = Date.now();
  let submissions: Record<string, unknown>[] = [];
  // Fail-fast: mỗi lần poll duyệt theo thứ tự test; gặp test đã xong
  // mà rớt thì dừng ngay, không đợi các test sau (đỡ tốn thời gian chờ).
  // Chỉ kết luận khi mọi test TRƯỚC nó đã xong và đúng.
  let failedIndex: number | null = null;
  for (; ;) {
    if (Date.now() - started > 90_000) throw new Error('Quá thời gian chờ Judge0 (90s)');
    await new Promise((r) => setTimeout(r, 1500));
    const body = (await this.judge0.getBatchSubmissions(tokens)) as {
      submissions?: Record<string, unknown>[];
    };
    submissions = body.submissions ?? [];
    let decided = submissions.length === tokens.length;
    if (decided) {
      for (let i = 0; i < hiddenTests.length; i++) {
        const sub = submissions[i] ?? {};
        const st = sub['status'] as { id?: number } | undefined;
        const done = st?.id === undefined || st.id > 2;
        if (!done) {
          decided = false;
          break;
        }
        const statusId = st?.id;
        const ok =
          statusId === 3 &&
          normalizeOutput(rawOutputOf(sub)) === normalizeOutput(hiddenTests[i].expected);
        if (!ok) {
          failedIndex = i + 1;
          break;
        }
      }
    }
    if (decided) break;
  }

  let passed = 0;
  for (let i = 0; i < hiddenTests.length; i++) {
    if (failedIndex !== null && i + 1 >= failedIndex) break;
    const expected = hiddenTests[i].expected;
    const actual = rawOutputOf(submissions[i] ?? {});
    const statusId = (submissions[i]?.['status'] as { id?: number })?.id;
    const ok = statusId === 3 && normalizeOutput(actual) === normalizeOutput(expected);
    if (ok) passed += 1;
    else if (failedIndex === null) failedIndex = i + 1;
  }

  const total = hiddenTests.length;
  const allPassed = failedIndex === null;
  const status = allPassed ? 'Accepted' : 'Wrong Answer';
  const statusId = allPassed ? 3 : 4;
  const first = submissions[0] as Record<string, unknown> | undefined;

  await this.db.submission.create({
    data: {
      userId,
      problemSlug: slug,
      languageId,
      sourceCode,
      status,
      statusId,
      passed: allPassed,
      passedCount: passed,
      totalCount: total,
      time: first?.['time'] as string | undefined,
      memory: typeof first?.['memory'] === 'number' ? (first?.['memory'] as number) : undefined,
    },
  });

  // cũng đánh dấu solved nếu đúng hết
  if (allPassed) {
    await this.db.solvedProblem.upsert({
      where: { userId_slug: { userId, slug } },
      create: { userId, slug, difficulty: (problem.difficulty as string) ?? undefined },
      update: {},
    });
    // đánh giá badge
    const streakMap: Record<string, number> = {};
    const acts = await this.db.activityDay.findMany({ where: { userId } });
    for (const r of acts) streakMap[new Date(r.date).toISOString().slice(0, 10)] = r.count;
    // badge đã có logic ở ProgressService, nhưng cũng có thể gọi, ở đây bỏ qua để tránh circular
  }

  return {
    passed: allPassed,
    passedCount: passed,
    totalCount: total,
    failedIndex,
    status,
    statusId,
    submissions,
  };
}
}
