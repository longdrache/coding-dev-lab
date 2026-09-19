import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.ts';
import { QnaService } from './qna.service.ts';
import { QnaController } from './qna.controller.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [QnaController],
  providers: [QnaService],
})
export class QnaModule {}
