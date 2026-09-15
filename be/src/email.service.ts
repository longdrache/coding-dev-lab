import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EmailService {
  constructor(private readonly mailService: MailerService) {}

  sendMail(email: string, name: string, message: string) {
    try {
      this.mailService.sendMail({
        from: 'no-reply@gocode.com',
        to: email,
        subject: `Thac mac cua ban ${name}`,
        text: message,
      });
    } catch (e) {
      console.error(e);
    }
  }
}
