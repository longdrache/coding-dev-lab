import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { SubmissionsService } from './submissions.service.ts';
import { SubmissionsController } from './submissions.controller.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
