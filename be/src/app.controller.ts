import { Controller, Get, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth/auth.guard.ts';
import { Roles } from './auth/roles.decorator.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { AdminGuard } from './admin/admin.guard.ts';
import { DatabaseService } from './database/database.service.ts';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Health check public cho uptime monitor (nginx/VPS) và Vercel.
   *
   * Không auth, không throttle riêng (ngưỡng mặc định 100/phút đủ cho
   * monitor 30s/lần). Ping DB thật bằng `SELECT 1`: endpoint chỉ báo `ok`
   * khi app chạm được database — check "server sống" mà DB chết thì vô nghĩa.
   * DB lỗi → status 503 để monitor báo động thay vì tưởng mọi thứ ổn.
   */
  @Get('api/health')
  async getHealth(): Promise<{
    status: 'ok';
    uptimeSeconds: number;
    db: 'up';
  }> {
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()), db: 'up' };
  }

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
