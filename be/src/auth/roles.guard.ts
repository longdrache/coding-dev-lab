import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator.ts';
import type { AuthenticatedRequest, UserRole } from './auth.types.ts';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRoles = request.user?.roles ?? [];
    if (requiredRoles.some((role) => userRoles.includes(role))) return true;

    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
  }
}
