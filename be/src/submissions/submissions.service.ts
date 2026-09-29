import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import type { UserRole } from '../auth/auth.types.ts';
import { VipProblemService } from '../problems/vip-problem.service.ts';

export type CreateSubmissionDto = {
  problemSlug: string;
  languageId: number;
  sourceCode: string;
  status?: string;
  statusId?: number | null;
  passed?: boolean | null;
  passedCount?: number | null;
  totalCount?: number | null;
  time?: string | null;
  memory?: number | null;
};

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly vipProblems: VipProblemService,
  ) {}

  /**
   * @param role role đã ký trong access token. Bài VIP thì chỉ `vip`/`admin` mới
   * ghi được `Submission` cho nó — nếu không thì ai cũng tự khai "đã giải xong"
   * một bài mình không đọc được đề, và dashboard của họ đầy bài không có thật.
   */
  async create(userId: number, dto: CreateSubmissionDto, role?: UserRole | null) {
    // Không tin client: validate shape + problem phải tồn tại
    const problemSlug = String(dto?.problemSlug ?? '').trim().slice(0, 120);
    const languageId = Number(dto?.languageId);
    const sourceCode = String(dto?.sourceCode ?? '');
    if (!problemSlug) throw new BadRequestException('Thiếu problemSlug');
    if (!Number.isInteger(languageId)) throw new BadRequestException('languageId không hợp lệ');
    if (!sourceCode || sourceCode.length > 64_000) {
      throw new BadRequestException('sourceCode quá dài hoặc rỗng (tối đa 64k)');
    }
    const problem = await this.db.problem.findUnique({
      where: { slug: problemSlug },
      select: { slug: true },
    });
    if (!problem) throw new BadRequestException('Bài toán không tồn tại');
    await this.vipProblems.assertSlugAllowed(problemSlug, role);
    const numOrNull = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    return this.db.submission.create({
      data: {
        userId,
        problemSlug,
        languageId,
        sourceCode,
        status: typeof dto.status === 'string' ? dto.status.slice(0, 60) : dto.status,
        statusId: numOrNull(dto.statusId),
        passed: typeof dto.passed === 'boolean' ? dto.passed : null,
        passedCount: numOrNull(dto.passedCount),
        totalCount: numOrNull(dto.totalCount),
        time: typeof dto.time === 'string' ? dto.time.slice(0, 20) : dto.time,
        memory: numOrNull(dto.memory),
      },
    });
  }

  /**
   * Lịch sử của chính người gọi. Khi `slug` trỏ tới bài VIP mà người gọi không
   * phải VIP thì trả 403 chứ không phải `[]` — `[]` vẫn là câu trả lời cho một
   * slug có thật, và kẻ dò bài VIP sẽ dò ra bài nào *đã từng* có ai nộp bằng
   * cách so 403 với 200.
   *
   * Không có `slug` (lịch sử chung) thì không hỏi cột `isVip`: đó là dữ liệu
   * riêng của người gọi, không có nội dung bài nào trong đó.
   */
  async findByUser(userId: number, slug?: string, role?: UserRole | null) {
    if (slug) await this.vipProblems.assertSlugAllowed(slug, role);
    const where: Record<string, unknown> = { userId };
    if (slug) where['problemSlug'] = slug;
    return this.db.submission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
