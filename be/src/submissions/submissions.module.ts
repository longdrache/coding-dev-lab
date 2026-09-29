import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { SubmissionsService } from './submissions.service.ts';
import { SubmissionsController } from './submissions.controller.ts';
import { VipProblemModule } from '../problems/vip-problem.module.ts';

@Module({
  imports: [DatabaseModule, VipProblemModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
