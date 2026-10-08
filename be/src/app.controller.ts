import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth/auth.guard.ts';
import { Roles } from './auth/roles.decorator.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { AdminGuard } from './admin/admin.guard.ts';

@Controller()
export class AppController {

  @Get('api/admin/health')
  @UseGuards(AdminGuard)
  getAdminHealth(): { ok: true } {
    return { ok: true };
  }

  @Get('api/vip/health')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('vip', 'admin')
  getVipHealth(): { ok: true } {
    return { ok: true };
  }
}
