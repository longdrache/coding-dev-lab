import { Module } from '@nestjs/common';
import { AppController } from './app.controller.ts';
import { AppService } from './app.service.ts';
import { Judge0Controller } from './judge0.controller.ts';
import { Judge0Service } from './judge0.service.ts';
import { ClerkAuthGuard } from './auth/clerk-auth.guard.ts';
import { RolesGuard } from './auth/roles.guard.ts';
import { PremiumController } from './premium.controller.ts';
import { PremiumService } from './premium.service.ts';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule } from '@nestjs/config';
import { EmailController } from './email.controller.ts';
import { EmailService } from './email.service.ts';
@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    MailerModule.forRoot({
      transport: {
        host: process.env.EMAIL_HOST,
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
      },
    }),
  ],
  controllers: [
    AppController,
    Judge0Controller,
    PremiumController,
    EmailController,
  ],
  providers: [
    AppService,
    Judge0Service,
    ClerkAuthGuard,
    RolesGuard,
    PremiumService,
    EmailService,
  ],
})
export class AppModule {}
