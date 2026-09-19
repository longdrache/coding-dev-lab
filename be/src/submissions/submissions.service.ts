import { Injectable } from '@nestjs/common';
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
    return this.db.submission.create({
      data: {
        clerkId,
        problemSlug: dto.problemSlug,
        languageId: dto.languageId,
        sourceCode: dto.sourceCode,
        status: dto.status,
        statusId: dto.statusId,
        passed: dto.passed,
        passedCount: dto.passedCount,
        totalCount: dto.totalCount,
        time: dto.time,
        memory: dto.memory,
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
