import type { IncomingHttpHeaders } from 'node:http';

export type UserRole = 'user' | 'vip' | 'admin';

export interface AuthenticatedUser {
  /** User.id dạng chuỗi, vì các service khác nhận chuỗi */
  userId: string;
  sessionId?: string;
  role?: UserRole;
  roles: UserRole[];
  /** Raw JWT claims thô. `AuthGuard` hiện chỉ ghi `userId`/`role`; giữ chỗ cho
   *  các claim khác sau này. */
  claims?: Record<string, unknown>;
}

export type AuthenticatedRequest = {
  headers: IncomingHttpHeaders;
  user?: AuthenticatedUser;
  /** refresh token thô của thiết bị hiện tại, để logout xoá đúng dòng */
  refreshToken?: string;
};
