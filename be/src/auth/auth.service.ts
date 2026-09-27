import {
  BadRequestException, ConflictException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import type { UserRole } from './auth.types.ts';
import {
  hashPassword, hashToken, newToken, signAccessToken, verifyPassword,
} from './tokens.ts';

export type PublicUser = {
  id: number; email: string; name: string | null; role: UserRole;
};

export type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Cổng gửi mail mà AuthService chỉ cần. Task 7 cài `AuthMailer` thật (nodemailer +
 * Mailtrap) vào `AuthModule` rồi wire vào đây.
 *
 * **Phải là `abstract class` chứ không phải `type`.** `emitDecoratorMetadata` chỉ ghi
 * được *tên lớp* vào `design:paramtypes`; với `type` thì Nest thấy `Object` và lúc
 * boot sẽ chết với `TypeError: metatype is not a constructor` (đo thật ở Task 7 —
 * `tsc` vẫn 0 mà app không dậy được, nên chỉ `tsc` không đủ). Dạng class cho Nest một
 * token DI thật, và `AuthService` vẫn không biết `AuthMailer` là gì — ánh xạ nằm ở
 * `auth.module.ts`.
 */
export abstract class AuthMailPort {
  abstract send(m: Mail): Promise<void>;
}

export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Số phiên đồng thời tối đa; đăng nhập thêm sẽ cắt phiên cũ nhất. */
export const MAX_SESSIONS = 10;
/** Token vừa bị xoay vòng còn dùng được trong 30 giây, để hai tab không giết nhau. */
const ROTATION_GRACE_MS = 30 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const UA_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_TAKEN = 'Email này đã được dùng để đăng ký';
/** Một câu duy nhất cho mọi lý do từ chối đăng nhập, không lộ email nào tồn tại. */
const BAD_CREDENTIALS = 'Email hoặc mật khẩu không đúng';
/**
 * Hash bcrypt cost 10 sinh một lần từ 32 byte ngẫu nhiên đã bị bỏ đi, dùng làm
 * "đối thủ" khi không có mật khẩu thật để so. Phải là hash **hợp lệ** và cùng
 * cost factor với `hashPassword`: `bcrypt.compare` với chuỗi sai dạng trả về
 * sau ~0,08ms thay vì ~65ms, tức là nhanh hơn 800 lần và lệch thời gian vẫn lộ
 * ra email nào đã đăng ký. Giá trị này không phải bí mật (mật khẩu gốc đã bị
 * bỏ) nhưng cũng không được log ra bất cứ đâu.
 */
const TIMING_EQUALIZER_HASH = '$2b$10$b4pTuLSFB9UWPmXDOcV9Pei0s.dOb8rVP50fuAAW.bqvkWAjSpalO';

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

  /**
   * Tạo user, dịch lỗi unique của Prisma thành 409. Hai người đăng ký cùng
   * email cùng lúc thì người thứ hai phải thấy 409 y như người đến sau, chứ
   * không phải 500. Lỗi khác thì ném nguyên để không giả làm "email trùng".
   */
  private async createUser(email: string, password: string) {
    try {
      return await this.db.user.create({
        data: { email, passwordHash: await hashPassword(password), role: 'user' },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(EMAIL_TAKEN);
      }
      throw e;
    }
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
    if (existing) throw new ConflictException(EMAIL_TAKEN);

    const user = await this.createUser(mail, password);
    const raw = newToken();
    await this.db.userToken.create({
      data: {
        userId: user.id, type: 'verify_email', tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        userAgent: userAgent?.slice(0, UA_MAX) ?? null,
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
        userAgent: userAgent?.slice(0, UA_MAX) ?? null,
      },
    });
    return token;
  }

  /**
   * Một lý do từ chối duy nhất cho đăng nhập: dùng chung cho email không tồn
   * tại, sai mật khẩu và chưa xác minh, để không lộ ra email nào đã đăng ký.
   */
  private denyCredentials(): never {
    throw new UnauthorizedException(BAD_CREDENTIALS);
  }

  /**
   * Tốn đúng một lần `bcrypt.compare` với một hash giả trị giá, dùng cho các
   * nhánh **không có mật khẩu thật để so** (email không tồn tại, user chưa có
   * `passwordHash`). Không có bước này thì nhánh đó trả về sau ~1ms còn nhánh có
   * mật khẩu thật sau ~65ms: dù câu báo lỗi đã dùng chung, kẻ dò email chỉ cần
   * đo thời gian là biết email nào đã đăng ký.
   */
  private async burnCompare(password: string): Promise<void> {
    await verifyPassword(String(password ?? ''), TIMING_EQUALIZER_HASH);
  }

  /**
   * Đăng nhập bằng email + mật khẩu. Mọi lý do từ chối (email không tồn tại, sai
   * mật khẩu, chưa xác minh email) đều ném cùng một `UnauthorizedException` với
   * cùng một câu, và đều tốn cùng một lần bcrypt, để không lộ ra email nào đã
   * đăng ký qua cả câu thông báo lẫn độ trễ.
   */
  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: PublicUser }> {
    const mail = String(email ?? '').trim().toLowerCase();
    const user = await this.db.user.findUnique({ where: { email: mail } });
    if (!user) {
      await this.burnCompare(password);
      this.denyCredentials();
    }
    if (!user.passwordHash) {
      await this.burnCompare(password);
      this.denyCredentials();
    }
    if (!(await verifyPassword(String(password ?? ''), user.passwordHash))) this.denyCredentials();
    if (!user.emailVerifiedAt) this.denyCredentials();

    const accessToken = await signAccessToken(user.id, (user.role as UserRole) ?? 'user');
    const refreshToken = await this.issueRefresh(user.id, userAgent);
    await this.trimSessions(user.id);
    return { accessToken, refreshToken, user: this.toPublic(user) };
  }

  /**
   * Chỉ giữ `MAX_SESSIONS` phiên mới nhất, xoá phần còn lại. Không đụng mã xác minh.
   *
   * `orderBy` phải có tie-break `id`: hai lần đăng nhập trong cùng một mili giây
   * có cùng `createdAt`, mà Postgres không bảo đảm thứ tự khi đó — không có
   * `id` thì phiên vừa cấp có thể bị xoá ngay và người dùng bị đuổi lập tức.
   */
  private async trimSessions(userId: number): Promise<void> {
    const rows = await this.db.userToken.findMany({
      where: { userId, type: 'refresh' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const stale = rows.slice(MAX_SESSIONS).map((r) => r.id);
    if (stale.length > 0) await this.db.userToken.deleteMany({ where: { id: { in: stale } } });
  }

  /**
   * Dòng phiên mà `hash` này được xoay vòng: ưu tiên dòng đang giữ token, nếu
   * không còn thì dòng đang giữ nó trong đệm 30 giây. `null` = token không dùng
   * được nữa, kể cả khi nó từng là token hợp lệ.
   */
  private async findRotatable(hash: string) {
    const row = await this.db.userToken.findFirst({ where: { tokenHash: hash } });
    if (row && row.type === 'refresh' && Date.now() < row.expiresAt.getTime()) return row;
    const prev = await this.db.userToken.findFirst({ where: { prevTokenHash: hash } });
    // `?? 0` = dòng trong đệm mà không có mốc hết hạn thì bị từ chối, không phải
    // để mãi xoay vòng được. `type` được kiểm lại vì `prevTokenHash` là cột
    // chung của mọi loại token.
    if (!prev || prev.type !== 'refresh' || Date.now() >= (prev.prevValidUntil?.getTime() ?? 0)) {
      return null;
    }
    return prev;
  }

  /**
   * Xoay vòng refresh token tại chỗ (một dòng phiên, không nhân bản). Token vừa
   * bị thay được giữ lại 30 giây để tab chậm không bị đá; quá 30 giây thì từ chối.
   * Trả `null` thay vì ném lỗi: client tự xoá phiên khi nhận null.
   */
  async refresh(
    token: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: PublicUser } | null> {
    const live = await this.findRotatable(hashToken(String(token ?? '')));
    if (!live) return null;
    const user = await this.db.user.findUnique({ where: { id: live.userId } });
    if (!user) return null;

    const fresh = newToken();
    await this.db.userToken.update({
      where: { id: live.id },
      data: {
        tokenHash: hashToken(fresh),
        prevTokenHash: live.tokenHash,
        prevValidUntil: new Date(Date.now() + ROTATION_GRACE_MS),
        lastUsedAt: new Date(),
        userAgent: userAgent?.slice(0, UA_MAX) ?? live.userAgent,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    const accessToken = await signAccessToken(user.id, (user.role as UserRole) ?? 'user');
    return { accessToken, refreshToken: fresh, user: this.toPublic(user) };
  }

  /** Đăng xuất một thiết bị: xoá dòng phiên dùng token này hoặc token vừa bị thay. */
  async logout(token: string): Promise<void> {
    const hash = hashToken(String(token ?? ''));
    await this.db.userToken.deleteMany({
      where: { OR: [{ tokenHash: hash }, { prevTokenHash: hash }] },
    });
  }

  /** Đăng xuất mọi thiết bị, ví dụ sau khi đổi mật khẩu. Giữ mã xác minh email. */
  async logoutAll(userId: number): Promise<void> {
    await this.db.userToken.deleteMany({ where: { userId, type: 'refresh' } });
  }

  async me(userId: number): Promise<PublicUser> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Phiên không hợp lệ');
    return this.toPublic(user);
  }
}
