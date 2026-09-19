import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  sendMail(email: string, name: string, message: string) {
    // Tạm log thay vì gửi SMTP để tránh lỗi ESM của @nestjs-modules/mailer trên Vercel.
    // QNA đã lưu DB, email chỉ là phụ. Khi cần gửi thật, cấu hình nodemailer trực tiếp ở đây.
    this.logger.log(`QNA mail to ${email} from ${name}: ${message.slice(0, 80)}`);
    return { queued: true };
  }
}
