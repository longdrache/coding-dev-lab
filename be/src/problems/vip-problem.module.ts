import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { VipProblemService } from './vip-problem.service.ts';

/**
 * Module nhỏ chỉ chứa `VipProblemService`, tách riêng khỏi `ProblemsModule`.
 *
 * Lý do: `submissions` và `progress` cũng phải hỏi "slug này có phải bài VIP
 * không", mà `ProblemsService` thì gắn với `Judge0Service` và không được export
 * ra ngoài. Module riêng giữ seam chỉ phụ thuộc `DatabaseService` đúng như nó
 * cần.
 */
@Module({
  imports: [DatabaseModule],
  providers: [VipProblemService],
  exports: [VipProblemService],
})
export class VipProblemModule {}
