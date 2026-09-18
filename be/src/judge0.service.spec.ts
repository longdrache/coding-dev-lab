import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Judge0Service } from './judge0.service.ts';

describe('Judge0Service', () => {
  beforeEach(() => {
    vi.stubEnv('JUDGE0_URL', 'http://localhost:2358');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a submission through the local Judge0 API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'submission-token' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new Judge0Service();
    const result = await service.createSubmission({
      language_id: 71,
      source_code: 'print("hello")',
      stdin: '',
    });

    expect(result).toEqual({ token: 'submission-token' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2358/submissions?base64_encoded=false&wait=false',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          language_id: 71,
          source_code: 'print("hello")',
          stdin: '',
          cpu_time_limit: 2,
          memory_limit: 128_000,
        }),
      }),
    );
  });

  it('gets a submission including its source code and result', async () => {
    const submission = {
      token: 'submission-token',
      source_code: 'print("hello")',
      stdout: 'aGVsbG8K',
      status: { id: 3, description: 'Accepted' },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(submission), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new Judge0Service();

    await expect(service.getSubmission('submission-token')).resolves.toEqual({
      ...submission,
      stdout: 'hello\n',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2358/submissions/submission-token?base64_encoded=true',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }),
    );
  });

  it('decodes non-UTF8 compiler output instead of dropping it', async () => {
    const raw = Buffer.from([0xff, 0xfe, 0x41]).toString('base64');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'bad-token',
          compile_output: raw,
          status: { id: 6, description: 'Compilation Error' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new Judge0Service();
    const result = (await service.getSubmission('bad-token')) as {
      compile_output: string;
    };
    expect(result.compile_output).toContain('�');
  });

  it('creates batch submissions through the Judge0 batch API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ token: 'token-1' }, { token: 'token-2' }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new Judge0Service();
    const result = await service.createBatchSubmissions([
      { language_id: 71, source_code: 'print(1)', stdin: 'a' },
      { language_id: 71, source_code: 'print(2)', stdin: 'b' },
    ]);

    expect(result).toEqual([{ token: 'token-1' }, { token: 'token-2' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2358/submissions/batch?base64_encoded=false',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          submissions: [
            {
              language_id: 71,
              source_code: 'print(1)',
              stdin: 'a',
              cpu_time_limit: 2,
              memory_limit: 128_000,
            },
            {
              language_id: 71,
              source_code: 'print(2)',
              stdin: 'b',
              cpu_time_limit: 2,
              memory_limit: 128_000,
            },
          ],
        }),
      }),
    );
  });

  it('clamps cpu and memory limits to block worker hogging', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ token: 'token-1' }]), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new Judge0Service();
    await service.createBatchSubmissions([
      {
        language_id: 71,
        source_code: 'while True: pass',
        stdin: '',
        cpu_time_limit: 3600,
        memory_limit: 999_999_999,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2358/submissions/batch?base64_encoded=false',
      expect.objectContaining({
        body: JSON.stringify({
          submissions: [
            {
              language_id: 71,
              source_code: 'while True: pass',
              stdin: '',
              cpu_time_limit: 5,
              memory_limit: 128_000,
            },
          ],
        }),
      }),
    );
  });

  it('gets batch submissions with a compact field set', async () => {
    const payload = {
      submissions: [
        { token: 'token-1', stdout: 'MQo=', status: { id: 3 } },
        { token: 'token-2', stdout: 'Mgo=', status: { id: 3 } },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new Judge0Service();
    await expect(
      service.getBatchSubmissions(['token-1', 'token-2']),
    ).resolves.toEqual({
      submissions: [
        { token: 'token-1', stdout: '1\n', status: { id: 3 } },
        { token: 'token-2', stdout: '2\n', status: { id: 3 } },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:2358/submissions/batch?'),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }),
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('tokens=token-1%2Ctoken-2');
    expect(url).toContain('base64_encoded=true');
  });
});
