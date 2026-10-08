import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AuthMailer } from './auth.mailer.ts';

// Chặn ở biên thư viện: không có mock này thì mỗi test gửi mail thật. Assert vào
// `createTransport`/`sendMail` là assert vào ranh giới của code ta sở hữu — chọn
// provider nào, dựng host/port thế nào, gửi từ đâu, hỏng thì log gì — chứ không
// phải assert lên mock vô nghĩa.
const h = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({ default: { createTransport: h.createTransport } }));

const MAIL = { to: 'a@b.co', subject: 'Xác nhận email', text: 'ma: 123' };
const OLD_ENV = { ...process.env };
/**
 * Mọi biến mail, kể cả biến Mailtrap đã bỏ — dọn sạch để `.env` của máy không lách test.
 * Các biến mail (`SMTP_USER`/`SMTP_PASS`) phải nằm trong
 * danh sách: máy dev nào cũng có thể còn sót một trong hai bên, và biến thừa lọt vào
 * làm một test "thiếu cấu hình" xanh vì lý do sai.
 */
const MAIL_VARS = [
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USERNAME',
  'EMAIL_PASSWORD',
  'EMAIL_FROM',
  'MAIL_API_TOKEN',
  'MAIL_FROM_EMAIL',
];

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of MAIL_VARS) delete process.env[k];
  h.sendMail.mockReset().mockResolvedValue({ messageId: 'id-1' });
  h.createTransport.mockReset().mockReturnValue({ sendMail: h.sendMail });
  error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  // Bộ ba hợp lệ. Tên biến lấy từ `AuthMailer.readConfig()` (`auth.mailer.ts:40-42`)
  // chứ không từ tài liệu: `SMTP_USER`/`SMTP_PASS` là hai biến mailer này thực sự
  // đọc. Test nào muốn khác thì set lại trong chính nó — không thừa hưởng từ `.env`
  // của máy (bài học từ f4d04c4).
  process.env.SMTP_USER = 'gocode@brevo.test';
  process.env.SMTP_PASS = 'xsmtpsib-v1-abc';
  process.env.MAIL_FROM = 'no-reply@gocode.vn';
});

afterEach(() => {
  error.mockRestore();
});

afterAll(() => {
  process.env = { ...OLD_ENV };
});

describe('thiếu cấu hình Brevo thì fail rõ ràng, không gửi nhầm qua provider khác', () => {
  // Cảnh báo đọc kỹ trước khi "sửa cho xanh": `AuthMailer` **đọc** `SMTP_USER` /
  // `SMTP_PASS` (`auth.mailer.ts:40-41`) nhưng dòng lỗi **in** tên cũ
  // `SMTP_USER` / `SMTP_PASS` (`:44-45`, `:58`). Test bám theo đúng thứ
  // code in ra — đổi tên ở đây là đỏ. Đây là bug sản phẩm (log dẫn người vận hành
  // điền vào hai biến mà code không đọc), đã báo chứ không tự sửa.
  it('thiếu SMTP_USER thì nêu đúng tên biến và không dựng transport', async () => {
    delete process.env.SMTP_USER;
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow(/SMTP_USER/);
    expect(h.createTransport).not.toHaveBeenCalled();
    expect(h.sendMail).not.toHaveBeenCalled();
  });

  it('thiếu SMTP_PASS thì nêu đúng tên biến và không dựng transport', async () => {
    delete process.env.SMTP_PASS;
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow(/SMTP_PASS/);
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('thiếu MAIL_FROM thì ném chứ không im lặng rơi về một địa chỉ mặc định', async () => {
    // Hồi quy thật: `MAIL_FROM ?? 'hello@demomailtrap.co'` làm mail đi từ một địa
    // chỉ không ai xác minh, Brevo chặn, mà không có dòng nào trong log nói ra.
    delete process.env.MAIL_FROM;
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow(/MAIL_FROM/);
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('thiếu cả ba thì nêu trọn danh sách biến thiếu, không phải từng biến một', async () => {
    for (const k of MAIL_VARS) delete process.env[k];
    const loi = await new AuthMailer().send(MAIL).catch((e: Error) => e);
    expect(String(loi?.message)).toContain('SMTP_USER');
    expect(String(loi?.message)).toContain('SMTP_PASS');
    expect(String(loi?.message)).toContain('MAIL_FROM');
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('giá trị chỉ khoảng trắng thì coi như chưa cấu hình', async () => {
    process.env.SMTP_PASS = '   ';
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow(/SMTP_PASS/);
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('SMTP_PASS là API key (xkeysib) thì nói thẳng sai loại khoá', async () => {
    // Nhầm lẫn đã xảy ra: API key dùng vào SMTP luôn fail bằng 401 khó hiểu.
    process.env.SMTP_PASS = 'xkeysib-v1-abc';
    const loi = await new AuthMailer().send(MAIL).catch((e: Error) => e);
    expect(String(loi?.message)).toContain('xsmtpsib');
    expect(String(loi?.message)).toContain('xkeysib');
    expect(h.createTransport).not.toHaveBeenCalled();
  });
});

describe('dựng transport Brevo', () => {
  it('đủ cấu hình thì dùng smtp-relay.brevo.com cổng 587, STARTTLS, auth bằng login + khoá', async () => {
    await new AuthMailer().send(MAIL);
    expect(h.createTransport).toHaveBeenCalledTimes(1);
    expect(h.createTransport.mock.calls[0][0]).toEqual({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'gocode@brevo.test', pass: 'xsmtpsib-v1-abc' },
    });
  });

  it('gửi thẳng từ MAIL_FROM, không bọc tên hiển thị "GoCode <...>"', async () => {
    // `from` là địa chỉ đã xác minh trên Brevo. Bọc thêm tên hiển thị thì thư đi
    // từ một sender không ai xác minh; code hiện tại gửi địa chỉ trần.
    await new AuthMailer().send(MAIL);
    expect(h.sendMail).toHaveBeenCalledTimes(1);
    expect(h.sendMail.mock.calls[0][0]).toEqual({
      from: 'no-reply@gocode.vn',
      to: [{ address: 'a@b.co' }],
      subject: MAIL.subject,
      text: MAIL.text,
      html: undefined,
    });
  });

  it('bỏ khoảng trắng thừa quanh biến môi trường trước khi đưa vào auth', async () => {
    process.env.SMTP_USER = '  gocode@brevo.test  ';
    process.env.MAIL_FROM = '  no-reply@gocode.vn  ';
    await new AuthMailer().send(MAIL);
    expect(h.createTransport.mock.calls[0][0]).toMatchObject({
      auth: { user: 'gocode@brevo.test' },
    });
    expect(h.sendMail.mock.calls[0][0].from).toBe('no-reply@gocode.vn');
  });
});

describe('lỗi gửi mail phải để lại dấu vết', () => {
  it('Brevo nổ thì log error kèm lý do rồi ném lại, không nuốt im lặng', async () => {
    h.sendMail.mockRejectedValue(new Error('535 authentication failed'));
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow('535 authentication failed');
    expect(error).toHaveBeenCalledTimes(1);
    const dong = String(error.mock.calls[0][0]);
    expect(dong).toContain('535 authentication failed');
    expect(dong).toContain('a@b.co');
    expect(dong).toContain(MAIL.subject);
  });

  it('lỗi không phải Error vẫn log được thay vì in [object Object]', async () => {
    h.sendMail.mockRejectedValue('chết');
    await expect(new AuthMailer().send(MAIL)).rejects.toBe('chết');
    expect(String(error.mock.calls[0][0])).toContain('unknown');
  });
});

describe('override SMTP_HOST cho Mailpit/Mailhog local (integration test)', () => {
  beforeEach(() => {
    process.env.SMTP_HOST = '127.0.0.1';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  });

  it('plaintext, không auth, cổng mặc định 1025', async () => {
    await new AuthMailer().send(MAIL);
    expect(h.createTransport).toHaveBeenCalledTimes(1);
    expect(h.createTransport.mock.calls[0][0]).toEqual({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      ignoreTLS: true,
    });
  });

  it('SMTP_PORT custom được tôn trọng', async () => {
    process.env.SMTP_PORT = '2525';
    await new AuthMailer().send(MAIL);
    expect(h.createTransport.mock.calls[0][0]).toMatchObject({ port: 2525 });
  });

  it('SMTP_PORT rác thì ném tên biến, không dựng transport', async () => {
    process.env.SMTP_PORT = 'cong-rác';
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow(/SMTP_PORT/);
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('thiếu MAIL_FROM thì ném dù đã override host', async () => {
    delete process.env.MAIL_FROM;
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow(/MAIL_FROM/);
    expect(h.createTransport).not.toHaveBeenCalled();
  });

  it('có SMTP_USER thì kèm auth (Mailpit có bật auth)', async () => {
    process.env.SMTP_USER = 'postmaster';
    process.env.SMTP_PASS = 'secret';
    await new AuthMailer().send(MAIL);
    expect(h.createTransport.mock.calls[0][0]).toMatchObject({
      auth: { user: 'postmaster', pass: 'secret' },
    });
  });
});
