import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { AuthMailPort, Mail } from './auth.service.ts';

/**
 * Hạ tầng gửi mail: **Brevo** qua SMTP.
 *
 * Một hệ thống, ba biến, không có đường vòng:
 * - `BREVO_SMTP_LOGIN` + `BREVO_SMTP_KEY` — tài khoản SMTP trên Brevo.
 * - `MAIL_FROM` — địa chỉ **đã xác minh** trong Brevo → Senders & Domains. Brevo từ
 *   chối mail gửi từ địa chỉ chưa xác minh, và hệ thống bên nhận cũng có thể chặn.
 *
 * Trước đây đây là hai nhánh: Mailtrap Sending API (`MAIL_API_TOKEN`) và SMTP
 * (`EMAIL_*`). Nhánh Mailtrap đã bỏ hẳn — domain demo của Mailtrap chỉ gửi được
 * tới email chủ tài khoản, nên "chạy được ở local" không đồng nghĩa "gửi được
 * tới người dùng thật", và nhánh đó chỉ tỏ ra hỏng khi có người dùng thật.
 *
 * `secure: false` + `requireTLS: true` là cổng 587 của Brevo: STARTTLS. Không có
 * `requireTLS` thì đó là " opportunistic" — nếu một tầng trung gian bỏ STARTTLS thì
 * mail bay đi không mã hoá mà không ai báo gì.
 *
 * **Thiếu cấu hình thì ném, không bỏ qua im lặng.** Không có địa chỉ dự phòng:
 * `MAIL_FROM ?? '<một địa chỉ bừa>'` là cách mail đi ra từ một sender không ai xác
 * minh, bị Brevo chặn, mà log vẫn sạch — đúng trạng thái khiến sự cố mail hỏng
 * không ai nhìn thấy. `AuthService` bắt lỗi này ở cả ba luồng nên nó không nổi ra
 * ngoài HTTP; nó lên log ở mức `error`.
 */
const BREVO_SMTP_HOST = 'smtp-relay.brevo.com';
const BREVO_SMTP_PORT = 587;

@Injectable()
export class AuthMailer implements AuthMailPort {
  private readonly logger = new Logger(AuthMailer.name);

  /**
   * Đọc và kiểm tra cấu hình. Ném ra tên biến còn thiếu thay vì tự bịa giá trị:
   * người đọc log phải biết chính xác cần điền gì, không phải đoán.
   */
  private readConfig(): { login: string; key: string; from: string } {
    const login = (process.env.SMTP_USER ?? '').trim();
    const key = (process.env.SMTP_PASS ?? '').trim();
    const from = (process.env.MAIL_FROM ?? '').trim();
    const thieu = [
      ...(login ? [] : ['BREVO_SMTP_LOGIN']),
      ...(key ? [] : ['BREVO_SMTP_KEY']),
      ...(from ? [] : ['MAIL_FROM']),
    ];
    if (thieu.length > 0) {
      throw new Error(
        `Chưa cấu hình gửi mail qua Brevo — thiếu ${thieu.join(', ')}. `
        + 'Lấy ở Brevo → Senders & Domains (phải xác minh) và Brevo → SMTP & API.',
      );
    }
    // API key (`xkeysib-`) dùng vào SMTP luôn fail bằng 401 khó hiểu. Chặn ở đây
    // biến "sai một dấu" thành một dòng log nói thẳng nguyên nhân.
    if (key.startsWith('xkeysib-')) {
      throw new Error(
        'BREVO_SMTP_KEY đang là API key (xkeysib-…) chứ không phải SMTP key (xsmtpsib-…). '
        + 'Hai loại khoá này không dùng thay nhau được — lấy đúng loại ở Brevo → SMTP & API.',
      );
    }
    return { login, key, from };
  }

  async send(m: Mail): Promise<void> {
    const { login, key, from } = this.readConfig();
    try {
      const transport = nodemailer.createTransport({
        host: BREVO_SMTP_HOST,
        port: BREVO_SMTP_PORT,
        secure: false,
        requireTLS: true,
        auth: { user: login, pass: key },
      });
      await transport.sendMail({
        from: from,
        to: [{ address: m.to }],
        subject: m.subject,
        text: m.text,
        html: m.html,
      });
    } catch (err) {
      // Mức `error`, không phải `warn`: hỏng mail xác nhận/mail đặt lại mật khẩu là
      // mất chức năng, chứ không phải bất thường nhỏ. `AuthService` vẫn bắt và log
      // riêng vì `AuthMailPort` là abstraction, một cài đặt khác có thể im lặng.
      this.logger.error(
        `Gửi mail "${m.subject}" tới ${m.to} qua Brevo thất bại: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
      );
      throw err;
    }
  }
}
