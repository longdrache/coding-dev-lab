import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { AuthenticatedRequest, UserRole } from './auth.types.ts';

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
    (role): role is UserRole =>
      role === 'user' || role === 'vip' || role === 'admin',
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
      let roles = getRoles(claimRecord);
      const userId = String(claimRecord.sub);

      // Nếu trong JWT Session claims chưa có role (do chưa cấu hình Session Token template trong Clerk Dashboard),
      // truy vấn trực tiếp Clerk API để lấy role từ publicMetadata của user:
      if (roles.length === 0) {
        try {
          const clerk = createClerkClient({
            secretKey: process.env.CLERK_SECRET_KEY ?? '',
          });
          const clerkUser = await clerk.users.getUser(userId);
          const metaRole = clerkUser.publicMetadata?.role;
          if (
            typeof metaRole === 'string' &&
            (metaRole === 'vip' || metaRole === 'admin' || metaRole === 'user')
          ) {
            roles = [metaRole];
          }
        } catch (fetchUserErr) {
          console.error('Không thể lấy metadata từ Clerk API:', fetchUserErr);
        }
      }

      if (roles.length === 0) roles.push('user');

      request.user = {
        userId,
        sessionId:
          typeof claimRecord.sid === 'string' ? claimRecord.sid : undefined,
        role: roles[0],
        roles,
        claims: claimRecord,
      };
      return true;
    } catch (e) {
      throw new UnauthorizedException(
        e instanceof Error ? e.message : 'Xác thực thất bại',
      );
    }
  }
}
