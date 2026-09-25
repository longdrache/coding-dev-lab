import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import { AdminController } from './admin.controller.ts';
import { DatabaseModule } from '../database/database.module.ts';
import { PresenceModule } from '../presence/presence.module.ts';
import { ViewsModule } from '../views/views.module.ts';

@Module({
  imports: [DatabaseModule, PresenceModule, ViewsModule],
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
