import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import { AdminController } from './admin.controller.ts';

@Module({
  providers: [AdminService, AdminGuard],
  controllers: [AdminController],
  exports: [AdminService, AdminGuard],
})
export class AdminModule {}
