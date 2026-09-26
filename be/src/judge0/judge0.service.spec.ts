import { afterEach, describe, expect, it, vi } from 'vitest';
import { Judge0Service } from './judge0.service.ts';

describe('Judge0Service', () => {
  const fetchMock = vi.fn();
  const svc = new Judge0Service();

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.JUDGE0_API_TOKEN;
    fetchMock.mockReset();
  });

  function mockFetch(body: unknown, status = 200) {
    fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('kẹp cpu_time_limit và ép memory_limit, gắn token khi có env', async () => {
    process.env.JUDGE0_API_TOKEN = 'secret';
    mockFetch([{ token: 't1' }]);
    await svc.createBatchSubmissions([
      { language_id: 71, source_code: 'print(1)', cpu_time_limit: 999 } as never,
      { language_id: 71, source_code: 'print(1)', cpu_time_limit: -3 } as never,
    ]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    const payload = JSON.parse(init.body) as { submissions: Array<Record<string, unknown>> };
    expect(payload.submissions[0].cpu_time_limit).toBe(5);
    expect(payload.submissions[1].cpu_time_limit).toBe(2);
    expect(payload.submissions[0].memory_limit).toBe(128_000);
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBe('secret');
  });

  it('không gắn X-Auth-Token khi thiếu env', async () => {
    mockFetch([{ token: 't1' }]);
    await svc.createBatchSubmissions([{ language_id: 71, source_code: 'print(1)' } as never]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBeUndefined();
  });

  it('báo rõ khi 401 (sai token)', async () => {
    mockFetch({ message: 'no' }, 401);
    await expect(svc.getSubmission('abc')).rejects.toThrow('401');
  });

  it('báo gateway khi mất mạng', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(svc.getSubmission('abc')).rejects.toThrow('Không thể kết nối');
  });
});
