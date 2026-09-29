import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import { Judge0Service } from '../judge0/judge0.service.ts';
import { TtlCache } from '../common/ttl-cache.ts';
import type { UserRole } from '../auth/auth.types.ts';
import {
  assertVipProblemAllowed,
  canAccessVipProblems,
  readIsVipFlag,
  redactVipListRow,
} from './vip-problem.policy.ts';

type PublicProblem = Record<string, unknown>;

const LIST_KEY = 'all';
// Danh sách đổi thường xuyên hơn (bài mới publish) nên TTL ngắn; chi tiết
// bài gần như bất biến nên để lâu. Không có invalidation thủ công: admin
// sửa xong tối đa phải chờ TTL mới thấy.
const LIST_TTL_MS = 60_000;
const SLUG_TTL_MS = 300_000;

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
  // Field chứ không phải constructor dep: giữ nguyên lời gọi
  // `new ProblemsService(db, judge0)` của test cũ.
  private readonly listCache = new TtlCache<PublicProblem[]>(LIST_TTL_MS);
  private readonly slugCache = new TtlCache<PublicProblem>(SLUG_TTL_MS);

  constructor(
    private readonly db: DatabaseService,
    private readonly judge0: Judge0Service,
  ) {}

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
    let rows = this.listCache.get(LIST_KEY);
    if (!rows) {
      const raw = await this.db.problem.findMany({
        where: { status: 'published' },
        orderBy: { createdAt: 'asc' },
      });
      // ẩn hiddenTests với client
      rows = raw.map((row) => {
        const { hiddenTests: _hiddenTests, ...rest } = row as Record<string, unknown>;
        return rest as PublicProblem;
      });
      this.listCache.set(LIST_KEY, rows);
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
  async findBySlug(slug: string, role?: UserRole | null): Promise<PublicProblem | null> {
    const hit = this.slugCache.get(slug);
    if (hit) {
      assertVipProblemAllowed(readIsVipFlag(hit['isVip']), role);
      return hit;
    }
    const row = await this.db.problem.findUnique({ where: { slug } });
    if (!row || (row as Record<string, unknown>).status !== 'published') return null;
    // Chặn **trước** khi cắt `hiddenTests` và trước khi đụng cache: dòng đầy đủ
    // của bài VIP không được đi qua bất kỳ đường trả về nào với người thường.
    assertVipProblemAllowed(readIsVipFlag((row as Record<string, unknown>)['isVip']), role);
    const { hiddenTests: _hiddenTests, ...rest } = row as Record<string, unknown>;
    // Không cache null: bài vừa publish sẽ thấy ngay ở request kế tiếp
    // thay vì phải chờ hết TTL.
    this.slugCache.set(slug, rest);
    return rest;
  }

  async submit(
    slug: string,
    userId: number,
    languageId: number,
    sourceCode: string,
    role?: UserRole | null,
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
    for (;;) {
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
