import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.js';
import { Roles } from './auth/roles.decorator.js';
import { RolesGuard } from './auth/roles.guard.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/admin/health')
  @UseGuards(ClerkAuthGuard, RolesGuard)
  @Roles('admin')
  getAdminHealth(): { ok: true } {
    return { ok: true };
  }
}
