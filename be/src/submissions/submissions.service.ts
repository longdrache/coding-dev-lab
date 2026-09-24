import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';

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
  constructor(private readonly db: DatabaseService) {}

  async create(clerkId: string, dto: CreateSubmissionDto) {
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
    const numOrNull = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    return this.db.submission.create({
      data: {
        clerkId,
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

  async findByUser(clerkId: string, slug?: string) {
    const where: Record<string, unknown> = { clerkId };
    if (slug) where['problemSlug'] = slug;
    return this.db.submission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
