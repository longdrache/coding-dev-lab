import { afterEach, describe, expect, it } from 'vitest';
import { getSiteUrl } from './site';

const OLD = { ...process.env };

afterEach(() => {
  process.env = { ...OLD };
});

describe('getSiteUrl', () => {
  it('ưu tiên NEXT_PUBLIC_SITE_URL, bỏ slash cuối', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://gocode.vn/';
    delete process.env.VERCEL_URL;
    expect(getSiteUrl()).toBe('https://gocode.vn');
  });

  it('dùng VERCEL_URL khi thiếu env', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_URL = 'fe-abc.vercel.app';
    expect(getSiteUrl()).toBe('https://fe-abc.vercel.app');
  });

  it('fallback localhost khi dev', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
    expect(getSiteUrl()).toBe('http://localhost:3000');
  });
});
