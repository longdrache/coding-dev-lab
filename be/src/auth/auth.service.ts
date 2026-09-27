import {
  BadRequestException, ConflictException, Injectable,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import type { UserRole } from './auth.types.ts';
import { hashPassword, hashToken, newToken, signAccessToken } from './tokens.ts';

export type PublicUser = {
  id: number; email: string; name: string | null; role: UserRole;
};

/**
 * Cổng gửi mail mà AuthService chỉ cần. Task 7 cài `AuthMailer` thật (nodemailer +
 * Mailtrap) vào AuthModule rồi wire vào đây, nên task này chỉ khai báo kiểu.
 * LƯU Ý cho Task 7: đây là `type` nên `emitDecoratorMetadata` ghi
 * `design:paramtypes = Object`; phải thêm `@Inject(AuthMailer)` cho tham số thứ hai
 * của AuthService, nếu không Nest không resolve được dependency.
 */
export type AuthMailPort = {
  send(m: { to: string; subject: string; text: string; html?: string }): Promise<void>;
};

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: AuthMailPort,
  ) {}

  private toPublic(u: Record<string, unknown>): PublicUser {
    const role = String(u.role ?? 'user') as UserRole;
    return { id: Number(u.id), email: String(u.email), name: (u.name as string) ?? null, role };
  }

  async register(email: string, password: string, userAgent?: string): Promise<{ message: string }> {
    const mail = String(email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) {
      throw new BadRequestException('Email không hợp lệ');
    }
    if (String(password ?? '').length < 8) {
      throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự');
    }
    const existing = await this.db.user.findUnique({ where: { email: mail } });
    if (existing) throw new ConflictException('Email này đã được dùng để đăng ký');

    const user = await this.db.user.create({
      data: { email: mail, passwordHash: await hashPassword(password), role: 'user' },
    });
    const raw = newToken();
    await this.db.userToken.create({
      data: {
        userId: user.id, type: 'verify_email', tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
    // Lỗi gửi mail không được làm hỏng đăng ký — user vẫn tồn tại và có thể gửi lại.
    try {
      await this.mail.send({
        to: mail,
        subject: 'Xác nhận email để hoàn tất đăng ký GoCode',
        text: `Chào bạn,\n\nMã xác nhận của bạn hết hạn sau 24 giờ:\n${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/sign-up?token=${raw}\n\nĐội ngũ GoCode`,
      });
    } catch {
      // im lặng có chủ ý: mail hỏng không được làm hỏng đăng ký
    }
    return { message: 'Đã gửi link xác nhận, vui lòng kiểm tra hộp thư.' };
  }

  async verifyEmail(
    token: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: PublicUser } | null> {
    const row = await this.db.userToken.findFirst({ where: { tokenHash: hashToken(String(token ?? '')) } });
    if (!row || row.type !== 'verify_email' || row.usedAt || Date.now() >= row.expiresAt.getTime()) {
      return null;
    }
    await this.db.userToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    const user = await this.db.user.update({
      where: { id: row.userId }, data: { emailVerifiedAt: new Date() },
    });
    const accessToken = await signAccessToken(user.id, (user.role as UserRole) ?? 'user');
    const refreshToken = await this.issueRefresh(user.id, userAgent);
    return { accessToken, refreshToken, user: this.toPublic(user) };
  }

  /** Cấp phiên cho một thiết bị. Mỗi lần gọi là một dòng UserToken riêng. */
  private async issueRefresh(userId: number, userAgent?: string): Promise<string> {
    const token = newToken();
    await this.db.userToken.create({
      data: {
        userId, type: 'refresh', tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
    });
    return token;
  }
}
