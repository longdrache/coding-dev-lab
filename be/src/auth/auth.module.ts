import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.ts';
import { AuthMailer } from './auth.mailer.ts';
import { AuthService, AuthMailPort } from './auth.service.ts';
import { AuthGuard } from './auth.guard.ts';
import { DatabaseModule } from '../database/database.module.ts';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    // `AuthMailPort` là token, `AuthMailer` là hiện thức. Không khai `AuthMailer` rời
    // để không có hai instance của cùng một mailer; ai cần gửi mail thì inject cổng.
    { provide: AuthMailPort, useClass: AuthMailer },
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
