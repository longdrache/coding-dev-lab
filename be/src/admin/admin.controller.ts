import { Body, Controller, Post, Res, UseGuards, Get, Req } from '@nestjs/common';
import { AdminService } from './admin.service.ts';
import { AdminGuard } from './admin.guard.ts';
import type { Response, Request } from 'express';

@Controller('api/admin')
export class AdminController {
  constructor(private svc: AdminService) {}

  @Post('login')
  async login(@Body() b: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const token = await this.svc.login(b.email, b.password);
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_token', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: Request) {
    return (req as any).admin;
  }
}
