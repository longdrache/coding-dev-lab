import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { ProgressService } from './progress.service.ts';
import { ProgressController } from './progress.controller.ts';
import { VipProblemModule } from '../problems/vip-problem.module.ts';

@Module({
  imports: [DatabaseModule, VipProblemModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
