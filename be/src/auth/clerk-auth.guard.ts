import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import type { AuthenticatedRequest, UserRole } from './auth.types.js';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function getRoles(claims: Record<string, unknown>): UserRole[] {
  const metadata = asRecord(claims.metadata);
  const publicMetadata = asRecord(claims.public_metadata);
  const roleClaim = claims.role ?? metadata.role ?? publicMetadata.role;
  const rolesClaim = claims.roles ?? metadata.roles ?? publicMetadata.roles;
  const values = Array.isArray(rolesClaim)
    ? rolesClaim
    : typeof roleClaim === 'string'
      ? [roleClaim]
      : [];

  return values.filter(
    (role): role is UserRole => role === 'user' || role === 'admin',
  );
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new UnauthorizedException('Thiếu Bearer token');
    }

    try {
      const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES;
      const claims = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY ?? '',
        ...(authorizedParties
          ? {
              authorizedParties: authorizedParties
                .split(',')
                .map((value) => value.trim()),
            }
          : {}),
      });
      const claimRecord = asRecord(claims);
      const roles = getRoles(claimRecord);
      if (roles.length === 0) roles.push('user');

      request.user = {
        userId: String(claimRecord.sub),
        sessionId:
          typeof claimRecord.sid === 'string' ? claimRecord.sid : undefined,
        role: roles[0],
        roles,
        claims: claimRecord,
      };
      return true;
    } catch {
      throw new UnauthorizedException(
        'Clerk token không hợp lệ hoặc đã hết hạn',
      );
    }
  }
}
