import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { Roles } from './auth/roles.decorator.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { AdminGuard } from './admin/admin.guard.ts';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/admin/health')
  @UseGuards(AdminGuard)
  getAdminHealth(): { ok: true } {
    return { ok: true };
  }

  @Get('api/vip/health')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @Roles('vip', 'admin')
  getVipHealth(): { ok: true } {
    return { ok: true };
  }
}
