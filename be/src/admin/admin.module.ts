import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import { AdminController } from './admin.controller.ts';
import { DatabaseModule } from '../database/database.module.ts';
import { PresenceModule } from '../presence/presence.module.ts';
import { ViewsModule } from '../views/views.module.ts';
import { ProblemsModule } from '../problems/problems.module.ts';

@Module({
  // `ProblemsModule` vào vì `AdminService` cần xoá cache sau khi đổi cờ VIP:
  // không xoá thì khoá có hiệu lực muộn tới hết TTL và đề bài vẫn lọt.
  imports: [DatabaseModule, PresenceModule, ViewsModule, ProblemsModule],
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
