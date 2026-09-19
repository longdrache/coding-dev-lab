import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';

@Injectable()
export class QnaService {
  constructor(private readonly db: DatabaseService) {}

  async create(data: { name: string; email: string; question: string; clerkId?: string }) {
    return this.db.qnaQuestion.create({
      data: {
        name: data.name,
        email: data.email,
        question: data.question,
        clerkId: data.clerkId,
      },
    });
  }

  async findAll() {
    return this.db.qnaQuestion.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
