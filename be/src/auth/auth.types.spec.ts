import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from './auth.types.ts';

describe('AuthenticatedRequest', () => {
  it('userId là chuỗi để các service khác dùng được', () => {
    const req = { headers: {}, user: { userId: '7', roles: ['user'] } } as AuthenticatedRequest;
    expect(typeof req.user!.userId).toBe('string');
  });
});
