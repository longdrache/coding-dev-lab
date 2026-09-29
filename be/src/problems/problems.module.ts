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
})
export class ProblemsModule {}
