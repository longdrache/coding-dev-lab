import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export type BotResponse = { status: number; ok: true; text: string };

@Injectable()
export class RagBotClient {
  private config(): { baseUrl: string; adminKey: string } {
    const baseUrl = (process.env.BOT_URL ?? '').trim().replace(/\/+$/, '');
    const adminKey = (process.env.ADMIN_KEY ?? '').trim();
    if (!baseUrl || !adminKey) {
      throw new ServiceUnavailableException('Chưa cấu hình BOT_URL/ADMIN_KEY');
    }
    return { baseUrl, adminKey };
  }

  async post(path: string, body: unknown, timeoutMs: number): Promise<BotResponse> {
    const { baseUrl, adminKey } = this.config();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new BadGatewayException('Không kết nối được bot RAG');
    }

    const text = await response.text();
    if (!response.ok) {
      throw new BadGatewayException(`Bot RAG trả lỗi ${response.status}`);
    }
    return { status: response.status, ok: true, text };
  }
}
