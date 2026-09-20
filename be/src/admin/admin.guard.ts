import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AdminService } from './admin.service.ts';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private svc: AdminService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req: any = ctx.switchToHttp().getRequest();
    let token: string | undefined = req.cookies?.admin_token;

    if (!token) {
      const auth: string | undefined = req.headers?.authorization;
      if (auth?.startsWith('Bearer ')) token = auth.slice(7);
      else if (auth) token = auth.replace('Bearer ', '');
    }

    // fallback: parse raw Cookie header if cookie-parser not mounted
    if (!token && typeof req.headers?.cookie === 'string') {
      const m = req.headers.cookie.match(/(?:^|;\s*)admin_token=([^;]*)/);
      if (m) {
        try {
          token = decodeURIComponent(m[1]);
        } catch {
          token = m[1];
        }
      }
    }

    if (!token) throw new UnauthorizedException('Thiếu admin token');
    try {
      const p = this.svc.verifyJwt(token);
      if (p.role !== 'admin') throw new Error('invalid role');
      req.admin = p;
      return true;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ');
    }
  }
}
