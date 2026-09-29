import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { ProblemsService } from './problems.service.ts';
import { ProblemsController } from './problems.controller.ts';
import { Judge0Service } from '../judge0/judge0.service.ts';
import { VipProblemModule } from './vip-problem.module.ts';

@Module({
  imports: [DatabaseModule, VipProblemModule],
  controllers: [ProblemsController],
  providers: [ProblemsService, Judge0Service],
  // `AdminModule` cần `invalidateProblemCache`: admin đổi cờ VIP mà cache còn
  // giữ bản `isVip` cũ thì khoá có hiệu lực muộn tới hết TTL (xem
  // `invalidateProblemCache`). Export ra đúng một hàm, không export cả
  // controller.
  exports: [ProblemsService],
})
export class ProblemsModule {}
