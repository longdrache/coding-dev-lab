import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { MailtrapTransport } from 'mailtrap';
import type { AuthMailPort, Mail } from './auth.service.ts';

/**
 * Cổng gửi mail của hệ đăng ký nội bộ. Chọn transport y hệt `admin.service.ts:347-389`
 * để không phải vận hành hai kiểu cấu hình mail trong cùng một backend:
 * `MAIL_API_TOKEN` (Mailtrap) được ưu tiên, thiếu thì mới rơi về SMTP thật.
 *
 * Hai khác biệt có chủ ý so với `admin.service.ts`:
 * 1. `secure: port === 465` (admin cũng vậy) chứ không ép `false` — cổng 465 là TLS
 *    ẩn danh, ép `secure: false` ở đó là SMTP chết.
 * 2. Nhánh SMTP gửi từ `EMAIL_FROM ?? GoCode <user>`: tên người gửi phải là địa chỉ
 *    đã xác minh trên đúng tài khoản SMTP đó, gửi bằng địa chỉ Mailtrap thì server
 *    nhận sẽ chặn.
 *
 * `send` **không nuốt lỗi**: nó log rồi ném lại. `AuthService.register` cố tình nuốt
 * (`catch {}`) để mail hỏng không làm hỏng đăng ký, nên nếu im lặng ở đây thì khi SMTP
 * chết sẽ âm thầm tạo user hàng loạt mà không ai biết.
 */
@Injectable()
export class AuthMailer implements AuthMailPort {
  private readonly logger = new Logger(AuthMailer.name);

  async send(m: Mail): Promise<void> {
    const apiToken = (process.env.MAIL_API_TOKEN ?? '').trim();
    const fromEmail = process.env.MAIL_FROM ?? 'hello@demomailtrap.co';
    try {
      if (apiToken) {
        const transport = nodemailer.createTransport(
          MailtrapTransport({ token: apiToken }),
        );
        await transport.sendMail({
          from: { address: fromEmail, name: 'GoCode' },
          to: [{ address: m.to }],
          subject: m.subject,
          text: m.text,
          html: m.html,
        });
        return;
      }

      const host = process.env.EMAIL_HOST;
      const user = process.env.EMAIL_USERNAME;
      const pass = process.env.EMAIL_PASSWORD;
      if (!host || !user || !pass) {
        // Không có transport nào: coi như gửi hụt, nhưng phải để lại dấu vết —
        // đây là lúc im lặng thì tài khoản mới đăng ký không bao giờ nhận được mã.
        this.logger.warn(
          `Chưa cấu hình MAIL_API_TOKEN hoặc EMAIL_HOST/EMAIL_USERNAME/EMAIL_PASSWORD — bỏ qua mail "${m.subject}" tới ${m.to}`,
        );
        return;
      }

      const port = Number(process.env.EMAIL_PORT ?? 587);
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      await transport.sendMail({
        from: process.env.EMAIL_FROM ?? `GoCode <${user}>`,
        to: [{ address: m.to }],
        subject: m.subject,
        text: m.text,
        html: m.html,
      });
    } catch (err) {
      this.logger.warn(
        `Gửi mail "${m.subject}" tới ${m.to} thất bại: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
      );
      throw err;
    }
  }
}
