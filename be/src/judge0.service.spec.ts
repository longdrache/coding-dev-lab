import { afterEach, describe, expect, it, vi } from 'vitest';
import { Judge0Service } from './judge0.service.js';

describe('Judge0Service', () => {
  afterEach(() => {
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
        }),
      }),
    );
  });

  it('gets a submission including its source code and result', async () => {
    const submission = {
      token: 'submission-token',
      source_code: 'print("hello")',
      stdout: 'hello\n',
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

    await expect(service.getSubmission('submission-token')).resolves.toEqual(
      submission,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2358/submissions/submission-token?base64_encoded=false',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }),
    );
  });
});
