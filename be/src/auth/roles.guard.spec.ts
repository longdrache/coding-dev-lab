import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.ts';
import { Roles } from './roles.decorator.ts';

class Ctl {
  @Roles('admin')
  adminOnly() {}
  open() {}
}

function ctx(roles?: string[]) {
  return {
    getHandler: () => Ctl.prototype.adminOnly,
    getClass: () => Ctl,
    switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }),
  } as any;
}

function ctxOpen() {
  return {
    getHandler: () => Ctl.prototype.open,
    getClass: () => Ctl,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as any;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('cho qua khi không yêu cầu role', () => {
    expect(guard.canActivate(ctxOpen())).toBe(true);
  });

  it('cho qua khi đủ role admin', () => {
    expect(guard.canActivate(ctx(['user', 'admin']))).toBe(true);
  });

  it('chặn (403) khi thiếu role hoặc không có user', () => {
    expect(() => guard.canActivate(ctx(['user']))).toThrow();
    expect(() => guard.canActivate(ctx())).toThrow();
  });
});
