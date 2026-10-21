import { describe, expect, it, vi } from 'vitest';
import { RagService, extractAnswer, normalizeChatInput } from './rag.service.ts';
import type { RagBotClient } from './rag.bot-client.ts';

function fakeBot(text: string) {
  const post = vi.fn().mockResolvedValue({ status: 200, ok: true as const, text });
  return { post } as unknown as RagBotClient & { post: typeof post };
}

describe('normalizeChatInput', () => {
  it('trim message và giữ history hợp lệ', () => {
    const out = normalizeChatInput({
      message: '  tại sao sai?  ',
      history: [
        { role: 'user', content: ' chào ' },
        { role: 'system', content: 'bỏ' },
        { role: 'assistant', content: 'chào bạn' },
      ],
      context: { problem: 'Tìm hai số bằng mục tiêu', language: 'javascript' },
    });
    expect(out.message).toBe('tại sao sai?');
    expect(out.history).toEqual([
      { role: 'user', content: 'chào' },
      { role: 'assistant', content: 'chào bạn' },
    ]);
    expect(out.problem).toBe('Tìm hai số bằng mục tiêu');
    expect(out.language).toBe('javascript');
  });

  it('chỉ giữ 10 lượt gần nhất', () => {
    const history = Array.from({ length: 15 }, (_, i) => ({
      role: 'user' as const,
      content: `câu ${i}`,
    }));
    const out = normalizeChatInput({ message: 'hỏi', history });
    expect(out.history).toHaveLength(10);
    expect(out.history[0].content).toBe('câu 5');
  });

  it('từ chối message rỗng hoặc quá dài', () => {
    expect(() => normalizeChatInput({ message: '   ' })).toThrow(/câu hỏi/i);
    expect(() => normalizeChatInput({ message: 'a'.repeat(2001) })).toThrow(/2000/);
  });

  it('không có context thì problem/language undefined', () => {
    const out = normalizeChatInput({ message: 'hỏi' });
    expect(out.problem).toBeUndefined();
    expect(out.language).toBeUndefined();
  });
});

describe('extractAnswer', () => {
  it('lấy answer từ JSON', () => {
    expect(extractAnswer('{"answer":"xin chào"}')).toBe('xin chào');
  });

  it('thử các khoá dự phòng', () => {
    expect(extractAnswer('{"reply":"a"}')).toBe('a');
    expect(extractAnswer('{"message":"b"}')).toBe('b');
    expect(extractAnswer('{"response":"c"}')).toBe('c');
  });

  it('dùng text thô khi không phải JSON', () => {
    expect(extractAnswer('  câu trả lời  ')).toBe('câu trả lời');
  });

  it('trả rỗng khi không có nội dung', () => {
    expect(extractAnswer('   ')).toBe('');
    expect(extractAnswer('{}')).toBe('{}');
  });
});

describe('RagService', () => {
  it('gửi message + history + context và trả answer', async () => {
    const bot = fakeBot('{"answer":"dùng HashMap"}');
    const svc = new RagService(bot);

    const out = await svc.ask({
      message: 'tối ưu thế nào?',
      history: [{ role: 'user', content: 'chào' }],
      context: { problem: 'Tìm hai số bằng mục tiêu', language: 'javascript' },
    });

    expect(out).toEqual({ answer: 'dùng HashMap' });
    expect(bot.post).toHaveBeenCalledWith(
      '/chat',
      {
        message: 'tối ưu thế nào?',
        history: [{ role: 'user', content: 'chào' }],
        context: { problem: 'Tìm hai số bằng mục tiêu', language: 'javascript' },
      },
      60_000,
    );
  });

  it('bot trả rỗng thì báo 502', async () => {
    const svc = new RagService(fakeBot('   '));
    await expect(svc.ask({ message: 'hỏi' })).rejects.toThrow(/rỗng/i);
  });
});
