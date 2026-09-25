import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import { Judge0Service } from '../judge0/judge0.service.ts';

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
  ) {}

  // Public: chỉ bài đã xuất bản mới hiện cho user
  async findAll() {
    const rows = await this.db.problem.findMany({
      where: { status: 'published' },
      orderBy: { createdAt: 'asc' },
    });
    // ẩn hiddenTests với client
    return rows.map(({ hiddenTests: _hiddenTests, ...rest }) => rest);
  }

  async findBySlug(slug: string) {
    const row = await this.db.problem.findUnique({ where: { slug } });
    if (!row || (row as Record<string, unknown>).status !== 'published') return null;
    const { hiddenTests: _hiddenTests, ...rest } = row as Record<string, unknown>;
    return rest;
  }

  async submit(slug: string, clerkId: string, languageId: number, sourceCode: string) {
    const problem = await this.db.problem.findUnique({ where: { slug } });
    if (!problem) throw new NotFoundException('Không tìm thấy bài toán');
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
    for (;;) {
      if (Date.now() - started > 90_000) throw new Error('Quá thời gian chờ Judge0 (90s)');
      await new Promise((r) => setTimeout(r, 1500));
      const body = (await this.judge0.getBatchSubmissions(tokens)) as {
        submissions?: Record<string, unknown>[];
      };
      submissions = body.submissions ?? [];
      const done = submissions.filter((s) => {
        const st = s['status'] as { id?: number } | undefined;
        return st?.id === undefined || st.id > 2;
      }).length;
      if (submissions.length === tokens.length && done === tokens.length) break;
    }

    let passed = 0;
    let failedIndex: number | null = null;
    for (let i = 0; i < hiddenTests.length; i++) {
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
        clerkId,
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
        where: { clerkId_slug: { clerkId, slug } },
        create: { clerkId, slug, difficulty: (problem.difficulty as string) ?? undefined },
        update: {},
      });
      // đánh giá badge
      const streakMap: Record<string, number> = {};
      const acts = await this.db.activityDay.findMany({ where: { clerkId } });
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
