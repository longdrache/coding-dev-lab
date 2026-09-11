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

@Injectable()
export class Judge0Service {
  private readonly baseUrl = (
    process.env.JUDGE0_URL ?? 'http://localhost:2358'
  ).replace(/\/$/, '');

  async createSubmission(input: CreateSubmissionInput) {
    return this.request('/submissions?base64_encoded=false&wait=false', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getSubmission(token: string) {
    return this.request(
      `/submissions/${encodeURIComponent(token)}?base64_encoded=false`,
    );
  }

  private async request(path: string, options?: RequestInit) {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
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
