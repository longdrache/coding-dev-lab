import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export interface CreateSubmissionInput {
  language_id: number;
  source_code: string;
  stdin?: string;
  expected_output?: string;
  cpu_time_limit?: number;
  memory_limit?: number;
}

export interface BatchSubmissionItem {
  language_id: number;
  source_code: string;
  stdin?: string;
  cpu_time_limit?: number;
  memory_limit?: number;
}

// Giới hạn chống code vòng lặp vô hạn chiếm worker Judge0.
// Judge0 chạy trên VM E2.1.Micro (1 OCPU / 1GB RAM) nên RAM cố định
// 128MB: đủ cho mọi bài hiện tại, compile không OOM cả máy.
// Đơn vị memory_limit của Judge0 là KB.
const DEFAULT_CPU_TIME_LIMIT = 2;
const MAX_CPU_TIME_LIMIT = 5;
const MEMORY_LIMIT_KB = 128_000;

// Timeout cho từng request BE -> Judge0: tránh socket treo ngốn tài
// nguyên khi Judge0 quá tải/không phản hồi (poll do FE đảm nhiệm).
const JUDGE0_REQUEST_TIMEOUT_MS = 30_000;

function clampLimit(
  value: number | undefined,
  def: number,
  max: number,
): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return def;
  }
  return Math.min(value, max);
}

// Chiều GỬI dùng text thuần (base64=false): source/stdin từ editor luôn
// là UTF-8 hợp lệ nên không vấn đề gì, đơn giản và dễ debug.
// Chiều NHẬN dùng base64 (mặc định của Judge0): output của trình biên
// dịch đôi khi chứa byte lạ, nếu xin text thuần thì batch sẽ lỗi cả loạt
// "cannot be converted to UTF-8" và mất luôn kết quả. Hàm decode của Node
// thay byte lỗi bằng ký tự thay thế, không throw.

const BASE64_TEXT_FIELDS = [
  'stdout',
  'stderr',
  'compile_output',
  'message',
] as const;

function decodeSubmission<T>(submission: T): T {
  if (!submission || typeof submission !== 'object') return submission;
  const copy = { ...(submission as Record<string, unknown>) };
  for (const field of BASE64_TEXT_FIELDS) {
    if (typeof copy[field] === 'string') {
      copy[field] = Buffer.from(copy[field] as string, 'base64').toString(
        'utf-8',
      );
    }
  }
  return copy as T;
}
import dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class Judge0Service {
  private get baseUrl() {
    return (process.env.JUDGE0_URL || 'http://localhost:2358').replace(
      /\/$/,
      '',
    );
  }

  async createSubmission(input: CreateSubmissionInput) {
    return this.request('/submissions?base64_encoded=false&wait=false', {
      method: 'POST',
      body: JSON.stringify(this.sanitize(input)),
    });
  }

  async getSubmission(token: string) {
    const submission = await this.request(
      `/submissions/${encodeURIComponent(token)}?base64_encoded=true`,
    );
    return decodeSubmission(submission);
  }

  async createBatchSubmissions(submissions: BatchSubmissionItem[]) {
    return this.request('/submissions/batch?base64_encoded=false', {
      method: 'POST',
      body: JSON.stringify({
        submissions: submissions.map((item) => this.sanitize(item)),
      }),
    });
  }

  async getBatchSubmissions(tokens: string[]) {
    const query = new URLSearchParams({
      tokens: tokens.join(','),
      base64_encoded: 'true',
      fields:
        'token,stdout,stderr,compile_output,status,time,memory,message',
    });
    const body = (await this.request(
      `/submissions/batch?${query.toString()}`,
    )) as { submissions?: unknown[] };
    return {
      ...body,
      submissions: (body.submissions ?? []).map((item) =>
        decodeSubmission(item),
      ),
    };
  }

  private sanitize<T extends { cpu_time_limit?: number; memory_limit?: number }>(
    input: T,
  ): T {
    return {
      ...input,
      cpu_time_limit: clampLimit(
        input.cpu_time_limit,
        DEFAULT_CPU_TIME_LIMIT,
        MAX_CPU_TIME_LIMIT,
      ),
      memory_limit: MEMORY_LIMIT_KB,
    };
  }
  private async request(path: string, options?: RequestInit) {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: options?.signal ?? AbortSignal.timeout(JUDGE0_REQUEST_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...options?.headers,
        },
      });
    } catch {
      throw new BadGatewayException(
        `Không thể kết nối tới Judge0 tại ${this.baseUrl}`,
      );
    }

    const body = await response.json().catch(() => null);

    if (response.status === 404) {
      throw new NotFoundException('Không tìm thấy submission trong Judge0');
    }

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Judge0 từ chối request',
        details: body,
      });
    }

    return body;
  }
}
