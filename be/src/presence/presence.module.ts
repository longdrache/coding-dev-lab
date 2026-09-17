import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller.ts';
import { PresenceService } from './presence.service.ts';

@Module({
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
