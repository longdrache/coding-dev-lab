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

function parseExpiresAt(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const v = metadata.expiresAt ?? metadata.expires_at ?? metadata.vipExpiresAt;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return new Date(v).toISOString();
  return null;
}

function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
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
      let clerkUserForExpiry: Awaited<ReturnType<ReturnType<typeof createClerkClient>['users']['getUser']>> | null = null;

      // Nếu trong JWT Session claims chưa có role (do chưa cấu hình Session Token template trong Clerk Dashboard),
      // truy vấn trực tiếp Clerk API để lấy role từ publicMetadata của user:
      if (roles.length === 0) {
        try {
          const clerk = createClerkClient({
            secretKey: process.env.CLERK_SECRET_KEY ?? '',
          });
          const clerkUser = await clerk.users.getUser(userId);
          clerkUserForExpiry = clerkUser;
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

      // Tự động hạ VIP nếu đã hết hạn (check lazy trên mỗi request authenticated)
      // Để tránh gọi Clerk API mỗi request, chỉ fetch khi role là vip và chưa có clerkUserForExpiry
      if (roles.includes('vip')) {
        try {
          let expiresAt: string | null = null;
          // Ưu tiên lấy từ claims nếu có
          const claimsMeta = asRecord(claimRecord.public_metadata ?? claimRecord.metadata);
          expiresAt = parseExpiresAt(claimsMeta);
          // Nếu claims không có expiresAt, fetch từ Clerk (reuse nếu đã fetch ở trên)
          if (!expiresAt) {
            if (!clerkUserForExpiry) {
              const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? '' });
              clerkUserForExpiry = await clerk.users.getUser(userId);
            }
            expiresAt = parseExpiresAt(clerkUserForExpiry.publicMetadata as Record<string, unknown>);
          }
          if (isExpired(expiresAt)) {
            console.warn(`[ClerkAuthGuard] VIP hết hạn cho ${userId} (expiresAt=${expiresAt}) → hạ xuống user`);
            // Hạ cấp ngay (fire-and-forget, không block request quá lâu; nhưng await để đảm bảo role trả về đúng)
            try {
              const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY ?? '' });
              await clerk.users.updateUserMetadata(userId, {
                publicMetadata: { role: 'user', premiumPlan: null, expiresAt: null, stripeSubscriptionId: null },
              });
            } catch (downgradeErr) {
              console.error(`[ClerkAuthGuard] Lỗi hạ VIP ${userId}:`, downgradeErr);
            }
            roles = roles.map((r) => (r === 'vip' ? 'user' : r)) as UserRole[];
            if (roles.length === 0) roles.push('user');
          }
        } catch (expiryErr) {
          console.error('[ClerkAuthGuard] Lỗi kiểm tra hết hạn VIP:', expiryErr);
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
