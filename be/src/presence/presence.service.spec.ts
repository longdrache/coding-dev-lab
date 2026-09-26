import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceService } from './presence.service.ts';

describe('PresenceService', () => {
  let svc: PresenceService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    svc = new PresenceService();
  });

  afterEach(() => {
    svc.onModuleDestroy();
    vi.useRealTimers();
  });

  it('heartbeat tăng/giảm count, leave xóa session', () => {
    expect(svc.heartbeat('s1')).toBe(1);
    expect(svc.heartbeat('s2')).toBe(2);
    expect(svc.heartbeat('s1')).toBe(2);
    expect(svc.leave('s1')).toBe(1);
    expect(svc.count()).toBe(1);
  });

  it('session quá 45s bị purge', () => {
    svc.heartbeat('old');
    vi.advanceTimersByTime(46_000);
    expect(svc.count()).toBe(0);
  });

  it('heartbeat làm mới TTL', () => {
    svc.heartbeat('s1');
    vi.advanceTimersByTime(40_000);
    svc.heartbeat('s1');
    vi.advanceTimersByTime(40_000);
    expect(svc.count()).toBe(1);
  });
});
