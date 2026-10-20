import { Module } from '@nestjs/common';
import { RagBotClient } from './rag.bot-client.ts';
import { RagController } from './rag.controller.ts';
import { RagService } from './rag.service.ts';

@Module({
  controllers: [RagController],
  providers: [RagBotClient, RagService],
  exports: [RagBotClient],
})
export class RagModule {}
