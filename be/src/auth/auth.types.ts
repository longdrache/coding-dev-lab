import type { IncomingHttpHeaders } from 'node:http';

export type UserRole = 'user' | 'admin';

export interface AuthenticatedUser {
  userId: string;
  sessionId?: string;
  role?: UserRole;
  roles: UserRole[];
  claims: Record<string, unknown>;
}

export type AuthenticatedRequest = {
  headers: IncomingHttpHeaders;
  user?: AuthenticatedUser;
};
