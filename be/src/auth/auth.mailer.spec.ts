import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { AuthMailer } from './auth.mailer.ts';

// Chặn ở biên thư viện: không có mock này thì mỗi test gửi mail thật. Assert vào
// `createTransport`/`sendMail` là assert vào ranh giới của code ta sở hữu — chọn
// transport nào, gửi từ đâu, hỏng thì log gì — chứ không phải assert lên mock vô nghĩa.
const h = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
  mailtrapTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({ default: { createTransport: h.createTransport } }));
vi.mock('mailtrap', () => ({ MailtrapTransport: h.mailtrapTransport }));

const MAIL = { to: 'a@b.co', subject: 'Xác nhận email', text: 'ma: 123' };
const OLD_ENV = { ...process.env };
const MAIL_VARS = [
  'MAIL_API_TOKEN',
  'MAIL_FROM',
  'EMAIL_HOST',
  'EMAIL_USERNAME',
  'EMAIL_PASSWORD',
  'EMAIL_PORT',
  'EMAIL_FROM',
];

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of MAIL_VARS) delete process.env[k];
  h.sendMail.mockReset().mockResolvedValue({ messageId: 'id-1' });
  h.createTransport.mockReset().mockReturnValue({ sendMail: h.sendMail });
  h.mailtrapTransport.mockReset().mockImplementation((o: unknown) => ({ via: 'mailtrap', ...(o as object) }));
  warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
});

afterAll(() => {
  process.env = { ...OLD_ENV };
});

describe('chọn transport', () => {
  it('có MAIL_API_TOKEN thì đi qua Mailtrap, không cần cấu hình SMTP', async () => {
    process.env.MAIL_API_TOKEN = 'token-1';
    process.env.EMAIL_HOST = 'smtp.b.co';
    process.env.EMAIL_USERNAME = 'u';
    process.env.EMAIL_PASSWORD = 'p';
    await new AuthMailer().send(MAIL);
    expect(h.mailtrapTransport).toHaveBeenCalledWith({ token: 'token-1' });
    expect(h.sendMail).toHaveBeenCalledTimes(1);
    expect(h.sendMail.mock.calls[0][0]).toMatchObject({
      from: { address: 'hello@demomailtrap.co', name: 'GoCode' },
      to: [{ address: 'a@b.co' }],
      subject: MAIL.subject,
      text: MAIL.text,
    });
  });

  it('MAIL_FROM ghi đè địa chỉ gửi của Mailtrap', async () => {
    process.env.MAIL_API_TOKEN = 'token-1';
    process.env.MAIL_FROM = 'hello@gocode.vn';
    await new AuthMailer().send(MAIL);
    expect(h.sendMail.mock.calls[0][0].from).toEqual({
      address: 'hello@gocode.vn',
      name: 'GoCode',
    });
  });

  it('MAIL_API_TOKEN chỉ khoảng trắng thì rơi về SMTP chứ không coi là có token', async () => {
    process.env.MAIL_API_TOKEN = '   ';
    process.env.EMAIL_HOST = 'smtp.b.co';
    process.env.EMAIL_USERNAME = 'u';
    process.env.EMAIL_PASSWORD = 'p';
    await new AuthMailer().send(MAIL);
    expect(h.mailtrapTransport).not.toHaveBeenCalled();
    expect(h.createTransport).toHaveBeenCalledWith({
      host: 'smtp.b.co',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
  });

  it('thiếu EMAIL_PASSWORD thì coi như chưa cấu hình, không gửi và có log', async () => {
    process.env.EMAIL_HOST = 'smtp.b.co';
    process.env.EMAIL_USERNAME = 'u';
    await new AuthMailer().send(MAIL);
    expect(h.createTransport).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Chưa cấu hình');
    expect(warn.mock.calls[0][0]).toContain('a@b.co');
  });

  it('chưa cấu hình gì thì log warn nêu đích và tiêu đề mail', async () => {
    await new AuthMailer().send(MAIL);
    expect(h.sendMail).not.toHaveBeenCalled();
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('Chưa cấu hình');
    expect(msg).toContain(MAIL.subject);
    expect(msg).toContain('a@b.co');
  });

  it('SMTP cổng 465 thì secure true, cổng 587 thì false', async () => {
    process.env.EMAIL_HOST = 'smtp.b.co';
    process.env.EMAIL_USERNAME = 'u';
    process.env.EMAIL_PASSWORD = 'p';
    process.env.EMAIL_PORT = '465';
    await new AuthMailer().send(MAIL);
    expect(h.createTransport.mock.calls[0][0]).toMatchObject({ port: 465, secure: true });
  });

  it('không có EMAIL_FROM thì gửi từ GoCode <user>, có thì dùng EMAIL_FROM', async () => {
    process.env.EMAIL_HOST = 'smtp.b.co';
    process.env.EMAIL_USERNAME = 'u@b.co';
    process.env.EMAIL_PASSWORD = 'p';
    await new AuthMailer().send(MAIL);
    expect(h.sendMail.mock.calls[0][0].from).toBe('GoCode <u@b.co>');
    process.env.EMAIL_FROM = 'no-reply@gocode.vn';
    await new AuthMailer().send(MAIL);
    expect(h.sendMail.mock.calls[1][0].from).toBe('no-reply@gocode.vn');
  });
});

describe('lỗi gửi mail phải để lại dấu vết', () => {
  it('SMTP nổ thì log warn rồi ném lại, không nuốt im lặng', async () => {
    process.env.EMAIL_HOST = 'smtp.b.co';
    process.env.EMAIL_USERNAME = 'u';
    process.env.EMAIL_PASSWORD = 'p';
    h.sendMail.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:587'));
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow('ECONNREFUSED');
    const msg = String(warn.mock.calls[0][0]);
    expect(msg).toContain('thất bại');
    expect(msg).toContain('ECONNREFUSED 127.0.0.1:587');
    expect(msg).toContain('a@b.co');
  });

  it('Mailtrap nổ thì cũng log, không để đăng ký im lặng thất bại', async () => {
    process.env.MAIL_API_TOKEN = 'token-1';
    h.sendMail.mockRejectedValue(new Error('401 Unauthenticated'));
    await expect(new AuthMailer().send(MAIL)).rejects.toThrow('401 Unauthenticated');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('401 Unauthenticated');
  });

  it('lỗi không phải Error vẫn log được thay vì in [object Object]', async () => {
    process.env.MAIL_API_TOKEN = 'token-1';
    h.sendMail.mockRejectedValue('chết');
    await expect(new AuthMailer().send(MAIL)).rejects.toBe('chết');
    expect(String(warn.mock.calls[0][0])).toContain('unknown');
  });
});
