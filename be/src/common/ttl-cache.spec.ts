import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from './ttl-cache.ts';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('trả undefined khi chưa có key', () => {
    const c = new TtlCache(1000);
    expect(c.get('a')).toBeUndefined();
  });

  it('trả giá trị khi còn trong TTL', () => {
    const c = new TtlCache(1000);
    c.set('a', { n: 1 });
    vi.advanceTimersByTime(999);
    expect(c.get('a')).toEqual({ n: 1 });
  });

  it('mất giá trị khi hết TTL', () => {
    const c = new TtlCache(1000);
    c.set('a', 'x');
    vi.advanceTimersByTime(1001);
    expect(c.get('a')).toBeUndefined();
  });

  it('ghi đè được giá trị cũ và gia hạn TTL', () => {
    const c = new TtlCache(1000);
    c.set('a', 'x');
    vi.advanceTimersByTime(900);
    c.set('a', 'y');
    vi.advanceTimersByTime(900);
    expect(c.get('a')).toBe('y');
  });

  it('delete gỡ key', () => {
    const c = new TtlCache(1000);
    c.set('a', 'x');
    c.delete('a');
    expect(c.get('a')).toBeUndefined();
  });

  it('key độc lập nhau', () => {
    const c = new TtlCache(1000);
    c.set('a', 1);
    c.set('b', 2);
    vi.advanceTimersByTime(1001);
    c.set('b', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(3);
  });

  it('giá trị null vẫn cache được (khác undefined)', () => {
    const c = new TtlCache(1000);
    c.set('a', null);
    expect(c.get('a')).toBeNull();
  });
});

describe('TtlCache.prune', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('xoá entry hết hạn, giữ entry còn hạn, trả số đã xoá', () => {
    const c = new TtlCache(1000);
    c.set('old', 1);
    vi.advanceTimersByTime(1001);
    c.set('fresh', 2);
    expect(c.prune()).toBe(1);
    expect(c.get('fresh')).toBe(2);
  });

  it('không xoá gì khi chưa có entry nào hết hạn', () => {
    const c = new TtlCache(1000);
    c.set('a', 1);
    c.set('b', 2);
    expect(c.prune()).toBe(0);
  });

  it('set tự gọi prune khi số key chạm ngưỡng', () => {
    const c = new TtlCache(1000);
    c.set('old', 1);
    vi.advanceTimersByTime(1001);
    for (let i = 0; i < 500; i++) c.set(`k${i}`, i);
    const spy = vi.spyOn(c, 'prune');
    c.set('trigger', 999);
    expect(spy).toHaveBeenCalled();
  });

  it('set không prune khi còn dưới ngưỡng', () => {
    const c = new TtlCache(1000);
    const spy = vi.spyOn(c, 'prune');
    c.set('a', 1);
    expect(spy).not.toHaveBeenCalled();
  });
});
