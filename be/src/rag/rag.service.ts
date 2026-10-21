import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { RagBotClient } from './rag.bot-client.ts';

export type ChatRole = 'user' | 'assistant';
export type ChatTurn = { role: ChatRole; content: string };
export type ChatInput = {
  message: string;
  history: ChatTurn[];
  problem?: string;
  language?: string;
};

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_HISTORY_TURNS = 10;

export function normalizeChatInput(raw: Record<string, unknown>): ChatInput {
  const message = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (!message) throw new BadRequestException('Thiếu câu hỏi');
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new BadRequestException(`Câu hỏi tối đa ${MAX_MESSAGE_LENGTH} ký tự`);
  }

  const history = (
    Array.isArray(raw.history)
      ? raw.history
          .map((turn): ChatTurn | null => {
            if (!turn || typeof turn !== 'object') return null;
            const { role, content } = turn as { role?: unknown; content?: unknown };
            if (role !== 'user' && role !== 'assistant') return null;
            if (typeof content !== 'string') return null;
            const trimmed = content.trim();
            if (!trimmed) return null;
            return { role, content: trimmed.slice(0, MAX_MESSAGE_LENGTH) };
          })
          .filter((turn): turn is ChatTurn => turn !== null)
      : []
  ).slice(-MAX_HISTORY_TURNS);

  const context =
    typeof raw.context === 'object' && raw.context !== null
      ? (raw.context as Record<string, unknown>)
      : {};
  const problem =
    typeof context.problem === 'string' ? context.problem.trim() : undefined;
  const language =
    typeof context.language === 'string' ? context.language.trim() : undefined;

  return { message, history, problem, language };
}

export function extractAnswer(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  try {
    const data = JSON.parse(trimmed) as Record<string, unknown>;
    for (const key of ['answer', 'reply', 'message', 'response'] as const) {
      const value = data?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  } catch {
    // không phải JSON: dùng text thô
  }
  return trimmed;
}

@Injectable()
export class RagService {
  constructor(private readonly bot: RagBotClient) {}

  async ask(raw: unknown): Promise<{ answer: string }> {
    const input = normalizeChatInput((raw ?? {}) as Record<string, unknown>);
    const res = await this.bot.post(
      '/chat',
      {
        message: input.message,
        history: input.history,
        context: { problem: input.problem, language: input.language },
      },
      60_000,
    );
    const answer = extractAnswer(res.text);
    if (!answer) throw new BadGatewayException('Bot RAG trả về nội dung rỗng');
    return { answer };
  }
}
