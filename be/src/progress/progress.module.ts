import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { ProgressService } from './progress.service.ts';
import { ProgressController } from './progress.controller.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
