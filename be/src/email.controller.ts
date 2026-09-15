import { Body, Controller, Post, Res } from '@nestjs/common';
import { EmailService } from './email.service.ts';

@Controller('api/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post()
  sendMailer(
    @Body('email') email: string,
    @Body('name') name: string,
    @Body('message') message: string,
    @Res() response: any,
  ) {
    const mail = this.emailService.sendMail(email, name, message);
    return response.status(200).json({
      message: 'success',
      mail,
    });
  }
}
