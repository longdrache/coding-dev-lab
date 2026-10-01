import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AdminService } from './admin.service.ts';

// Chặn ở biên thư viện: không có mock này thì mỗi test gửi mail thật. Assert vào
// `createTransport`/`sendMail` là assert vào ranh giới của code ta sở hữu — chọn
// provider nào, dựng host/port thế nào, gửi từ đâu — chứ không phải assert lên
// mock vô nghĩa.
const h = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({ default: { createTransport: h.createTransport } }));

const OLD_ENV = { ...process.env };
/** Mọi biến mail, kể cả biến Mailtrap đã bỏ — dọn sạch để `.env` của máy không lách test. */
const MAIL_VARS = [
  'USER_LOGIN',
  'USER_PASS',
  'MAIL_FROM',
  'MAIL_API_TOKEN',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USERNAME',
  'EMAIL_PASSWORD',
  'EMAIL_FROM',
];

const QUESTION = { id: 'q1', name: 'Hà An', email: 'han@gocode.vn', question: 'Bài này sao?' };

function makeSvc() {
  const db = { qnaQuestion: { findUnique: vi.fn(async () => QUESTION) } };
  return new AdminService(db as any);
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of MAIL_VARS) delete process.env[k];
  h.sendMail.mockReset().mockResolvedValue({ messageId: 'id-1' });
  h.createTransport.mockReset().mockReturnValue({ sendMail: h.sendMail });
  log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  // Bộ ba hợp lệ. Tên biến lấy từ `AdminService.replyQna` (`admin.service.ts:339-341`).
  process.env.USER_LOGIN = 'gocode@brevo.test';
  process.env.USER_PASS = 'xsmtpsib-v1-abc';
  process.env.MAIL_FROM = 'no-reply@gocode.vn';
});

afterEach(() => {
  log.mockRestore();
  process.env = { ...OLD_ENV };
});

describe('AdminService.replyQna gửi mail qua Brevo', () => {
  it('đủ cấu hình thì dùng smtp-relay.brevo.com cổng 587, STARTTLS, gửi từ MAIL_FROM', async () => {
    const r = await makeSvc().replyQna('q1', 'Cảm ơn bạn');
    expect(h.createTransport).toHaveBeenCalledTimes(1);
    expect(h.createTransport.mock.calls[0][0]).toEqual({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'gocode@brevo.test', pass: 'xsmtpsib-v1-abc' },
    });
    // `from` là địa chỉ đã xác minh trên Brevo, gửi trần — không bọc `GoCode <...>`.
    expect(h.sendMail.mock.calls[0][0].from).toBe('no-reply@gocode.vn');
    expect(h.sendMail.mock.calls[0][0].to).toBe('han@gocode.vn');
    expect(r).toEqual({ ok: true, to: 'han@gocode.vn', messageId: 'id-1' });
  });

  it('thiếu MAIL_FROM thì báo rõ biến thiếu, không rơi về địa chỉ mặc định', async () => {
    delete process.env.MAIL_FROM;
    await expect(makeSvc().replyQna('q1', 'Cảm ơn bạn')).rejects.toThrow(/MAIL_FROM/);
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('chỉ có MAIL_API_TOKEN (kiểu cũ) thì vẫn fail chứ không gửi nhầm qua provider khác', async () => {
    // Hồi quy thật: còn nhánh Mailtrap thì đặt `MAIL_API_TOKEN` là mail đi mà
    // không hề đi qua Brevo, tức test này xanh trong khi sản phẩm vẫn hỏng.
    process.env.MAIL_API_TOKEN = 'token-1';
    delete process.env.USER_LOGIN;
    delete process.env.USER_PASS;
    await expect(makeSvc().replyQna('q1', 'Cảm ơn bạn')).rejects.toThrow(/USER_LOGIN/);
    expect(h.createTransport).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it('USER_PASS là API key (xkeysib) thì nói thẳng sai loại khoá', async () => {
    process.env.USER_PASS = 'xkeysib-v1-abc';
    await expect(makeSvc().replyQna('q1', 'Cảm ơn bạn')).rejects.toThrow(/xsmtpsib/);
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('Brevo nổ thì admin thấy lý do, không phải 500 trần', async () => {
    h.sendMail.mockRejectedValue(new Error('535 authentication failed'));
    await expect(makeSvc().replyQna('q1', 'Cảm ơn bạn')).rejects.toThrow(/535 authentication failed/);
  });
});
