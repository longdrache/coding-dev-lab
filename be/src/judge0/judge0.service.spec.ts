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

  // 404 là nhánh riêng vì nó **không** phải lỗi hạ tầng: token không tồn tại thì FE
  // cần `404` để hiện "không tìm thấy", không phải `502` để hiện "lỗi mạng".
  it('404 thì NotFound, không phải gateway', async () => {
    mockFetch({ message: 'not found' }, 404);
    await expect(svc.getSubmission('abc')).rejects.toMatchObject({ status: 404 });
  });

  // 500 của Judge0: phải mang **nội dung** họ trả về, không phải chuỗi rỗng —
  // không có chi tiết thì không debug được lỗi chấm bài.
  it('lỗi 5xx thì kèm nguyên body Judge0 trả về', async () => {
    mockFetch({ compile_output: 'syntax error' }, 500);
    await expect(svc.getSubmission('abc')).rejects.toMatchObject({
      response: { message: 'Judge0 từ chối request', details: { compile_output: 'syntax error' } },
    });
  });

  // Judge0 trả HTML (proxy chen trước) thì `json()` ném; nếu không bắt thì lỗi
  // JSON parse lọt ra ngoài thay vì thành `502` đúng nghĩa.
  it('body không phải JSON thì không ném lỗi parse', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('Unexpected token <')),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(svc.getSubmission('abc')).rejects.toThrow('Judge0 từ chối request');
  });

  it('token có khoảng trắng thì cắt trước khi gửi', async () => {
    process.env.JUDGE0_API_TOKEN = '  secret  ';
    mockFetch([{ token: 't1' }]);
    await svc.createBatchSubmissions([{ language_id: 71, source_code: 'print(1)' } as never]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBe('secret');
  });

  // Judge0 chạy sau reverse-proxy nên `JUDGE0_URL` hay có dấu `/` cuối; giữ
  // nguyên thì URL thành `//submissions` và proxy trả 404.
  it('bỏ dấu `/` cuối của `JUDGE0_URL`', async () => {
    process.env.JUDGE0_URL = 'https://judge0.example.com/';
    try {
      mockFetch({ token: 't1' });
      await svc.getSubmission('t1');
      expect(fetchMock.mock.calls[0]![0]).toBe('https://judge0.example.com/submissions/t1?base64_encoded=true');
    } finally {
      delete process.env.JUDGE0_URL;
    }
  });

  it('không có `JUDGE0_URL` thì lùi về localhost', async () => {
    delete process.env.JUDGE0_URL;
    mockFetch({ token: 't1' });
    await svc.getSubmission('t1');
    expect(fetchMock.mock.calls[0]![0]).toContain('http://localhost:2358/');
  });

  // `cpu_time_limit` không phải số (client gửi chuỗi) hoặc NaN thì về mặc định,
  // không phải `Math.min('abc', 5)` = NaN — Judge0 sẽ báo lỗi khó hiểu.
  it('`cpu_time_limit` không phải số thì về mặc định', async () => {
    mockFetch([{ token: 't1' }]);
    await svc.createBatchSubmissions([
      { language_id: 71, source_code: 'x', cpu_time_limit: 'abc' } as never,
      { language_id: 71, source_code: 'x', cpu_time_limit: Number.NaN } as never,
      { language_id: 71, source_code: 'x', cpu_time_limit: 0 } as never,
    ]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    const payload = JSON.parse(init.body) as { submissions: Array<Record<string, unknown>> };
    for (const sub of payload.submissions) expect(sub.cpu_time_limit).toBe(2);
  });

  it('`cpu_time_limit` trong khoảng thì giữ nguyên, không kẹp xuống dưới', async () => {
    mockFetch([{ token: 't1' }]);
    await svc.createBatchSubmissions([{ language_id: 71, source_code: 'x', cpu_time_limit: 3 } as never]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    const payload = JSON.parse(init.body) as { submissions: Array<Record<string, unknown>> };
    expect(payload.submissions[0].cpu_time_limit).toBe(3);
  });
});

/**
 * Chiều NHẬN dùng base64 vì output của trình biên dịch đôi khi chứa byte lạ; xin
 * text thuần thì cả batch lỗi "cannot be converted to UTF-8" và mất trắng kết quả.
 */
describe('Judge0Service — giải mã output base64', () => {
  const fetchMock = vi.fn();
  const svc = new Judge0Service();
  const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function mockFetch(body: unknown) {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('mọi trường text đều được giải mã', async () => {
    mockFetch({
      token: 't1',
      stdout: b64('ket qua 42\n'),
      stderr: b64('canh bao\n'),
      compile_output: b64('khong co loi\n'),
      message: b64('Processed\n'),
    });
    const sub = await svc.getSubmission('t1');
    expect(sub.stdout).toBe('ket qua 42\n');
    expect(sub.stderr).toBe('canh bao\n');
    expect(sub.compile_output).toBe('khong co loi\n');
    expect(sub.message).toBe('Processed\n');
  });

  // `null` là giá trị Judge0 trả khi không có output; decode chuỗi rỗng sẽ ra `''`
  // và FE hiện một dòng trống.
  it('trường null hoặc không có thì giữ nguyên, không sinh chuỗi rỗng', async () => {
    mockFetch({ token: 't1', stdout: null, stderr: null });
    const sub = await svc.getSubmission('t1');
    expect(sub.stdout).toBeNull();
    expect(sub.stderr).toBeNull();
  });

  it('token có ký tự lạ thì được mã hoá trước khi ghép URL', async () => {
    mockFetch({ token: 'a/b c' });
    await svc.getSubmission('a/b c');
    expect(fetchMock.mock.calls[0]![0]).toContain('/submissions/a%2Fb%20c');
  });

  it('batch không có `submissions` thì trả mảng rỗng chứ không ném', async () => {
    mockFetch({ submissions: null });
    const out = await svc.getBatchSubmissions(['t1']);
    expect(out.submissions).toEqual([]);
  });

  it('batch giải mã từng phần tử', async () => {
    mockFetch({ submissions: [{ token: 't1', stdout: b64('ok') }, { token: 't2', stdout: null }] });
    const out = await svc.getBatchSubmissions(['t1', 't2']);
    const rows = out.submissions as Array<Record<string, unknown>>;
    expect(rows[0]!['stdout']).toBe('ok');
    expect(rows[1]!['stdout']).toBeNull();
  });

  // Judge0 trả `null` cho submission vừa tạo khi `wait=false`; nếu `decodeSubmission`
  // không chịu dữ liệu không phải object thì mọi lần nộp bài đầu đều ném.
  it('payload không phải object thì trả nguyên, không ném', async () => {
    mockFetch(null);
    expect(await svc.getSubmission('t1')).toBeNull();
  });
});
