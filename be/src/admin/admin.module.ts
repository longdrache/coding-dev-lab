import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import { AdminController } from './admin.controller.ts';
import { DatabaseModule } from '../database/database.module.ts';
import { PresenceModule } from '../presence/presence.module.ts';

@Module({
  imports: [DatabaseModule, PresenceModule],
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
