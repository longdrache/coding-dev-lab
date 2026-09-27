import {
  BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException,
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
/**
 * Hạn của mã đặt lại mật khẩu: **1 giờ**, ngắn hơn 24 giờ của mã xác minh email.
 * Mã xác minh chỉ mở một ô cửa (bật `emailVerifiedAt`), còn mã này mở thẳng quyền
 * truy cập tài khoản — nên không có lý do để cho nó sống bằng mã xác minh.
 */
const RESET_TTL_MS = 60 * 60 * 1000;
const UA_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_TAKEN = 'Email này đã được dùng để đăng ký';
const PASSWORD_TOO_SHORT = 'Mật khẩu phải có ít nhất 8 ký tự';
/**
 * Câu duy nhất mà `forgotPassword` được phép trả về, dùng cho **mọi** trường hợp:
 * email không tồn tại, chưa xác minh, sai định dạng, hay đã có mã còn hạn. Ba trường
 * hợp đầu trả lời khác nhau chính là công cụ dò email, nên khác biệt phải nằm ở
 * việc có gửi mail hay không chứ không nằm ở câu trả lời.
 */
const RESET_REQUESTED = 'Nếu email đó có tài khoản, chúng tôi đã gửi link đặt lại mật khẩu.';
/**
 * Câu duy nhất `resendVerification` được phép trả về, dùng cho **mọi** trường hợp:
 * email không tồn tại, chưa xác minh, đã xác minh rồi, và sai định dạng. Cùng lý
 * do với `RESET_REQUESTED` — bốn câu khác nhau chính là công cụ dò email, nên khác
 * biệt phải nằm ở việc *có gửi mail hay không*, không nằm ở câu trả lời.
 */
const RESEND_SENT =
  'Nếu email đó có tài khoản chưa xác minh, chúng tôi đã gửi lại link xác nhận.';
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
  private readonly logger = new Logger(AuthService.name);

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
      throw new BadRequestException(PASSWORD_TOO_SHORT);
    }
    const existing = await this.db.user.findUnique({ where: { email: mail } });
    if (existing) throw new ConflictException(EMAIL_TAKEN);

    const user = await this.createUser(mail, password);
    const msg = await this.issueVerification(user.id, mail, userAgent);
    // Lỗi gửi mail không được làm hỏng đăng ký — user vẫn tồn tại và có thể gửi lại.
    try {
      await this.mail.send(msg);
    } catch {
      // im lặng có chủ ý: mail hỏng không được làm hỏng đăng ký
    }
    return { message: 'Đã gửi link xác nhận, vui lòng kiểm tra hộp thư.' };
  }

  /**
   * Sinh mã xác minh 24 giờ **và** dựng sẵn mail, dùng chung cho lúc đăng ký và lúc
   * gửi lại link.
   *
   * Gộp hai thứ vào một chỗ vì chúng là **một** hợp đồng: mail gửi lại mà lệch
   * hạn hoặc lệch link với mail lúc đăng ký thì câu "hết hạn sau 24 giờ" trong
   * mail là nói dối. Tách ra rồi copy-paste là chỗ hai bản lệch nhau sẽ tới.
   */
  private async issueVerification(userId: number, to: string, userAgent?: string): Promise<Mail> {
    const raw = newToken();
    await this.db.userToken.create({
      data: {
        userId, type: 'verify_email', tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        userAgent: userAgent?.slice(0, UA_MAX) ?? null,
      },
    });
    return {
      to,
      subject: 'Xác nhận email để hoàn tất đăng ký GoCode',
      text: `Chào bạn,\n\nMã xác nhận của bạn hết hạn sau 24 giờ:\n${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/sign-up?token=${raw}\n\nĐội ngũ GoCode`,
    };
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
   * Gửi lại link xác nhận cho tài khoản **chưa** xác minh.
   *
   * Nút "Gửi lại link" ở màn "kiểm tra hộp thư" không thể gọi lại `register`: tài
   * khoản vừa đăng ký thì chắc chắn đã tồn tại, nên `register` ném 409 và không
   * gửi mail — nút đó chết đúng lúc cần nhất.
   *
   * Cùng nguyên tắc chống lộ trạng thái với `forgotPassword`: **luôn** trả về
   * `RESEND_SENT`, kể cả khi email không tồn tại, đã xác minh rồi, hay sai định
   * dạng. Ba nhánh đầu trả lời khác nhau chính là công cụ dò email; khác biệt
   * phải nằm ở việc có tạo mã và gửi mail hay không.
   *
   * Mail gửi **nền, cố ý không `await`** — y hệt `forgotPassword`, vì SMTP là
   * số hạng lớn nhất của endpoint này: response nếu chờ nó thì thời gian phản
   * hồi tự nó phân biệt được "tài khoản này chưa xác minh" với "không có tài
   * khoản", phá đúng cái biện pháp "luôn trả cùng một câu".
   */
  async resendVerification(email: string, userAgent?: string): Promise<{ message: string }> {
    const mail = String(email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return { message: RESEND_SENT };
    const user = await this.db.user.findUnique({ where: { email: mail } });
    // Đã xác minh rồi thì link cũ vẫn còn giá trị (chưa dùng, còn hạn) — gửi thêm
    // chỉ là mail rác. Nhưng **không** nói ra điều đó: cùng câu, cùng 200.
    if (!user || user.emailVerifiedAt) return { message: RESEND_SENT };

    const msg = await this.issueVerification(user.id, mail, userAgent);
    this.mail.send(msg).catch((err: unknown) => {
      // Không nuốt im lặng: đường này chạy nền nên không có ai đỡ lỗi. Chỉ log —
      // khác `forgotPassword` ở chỗ **không** trả lại mã: ở đó có cooldown theo
      // tài khoản nên phải trả mã để không nuốt lần xin lại sau, còn đây chỉ
      // chặn theo IP nên bấm lại là ra mã mới ngay.
      this.logger.warn(
        `Gửi lại mail xác nhận tới ${mail} thất bại: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
      );
    });
    return { message: RESEND_SENT };
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

  /**
   * Quên mật khẩu: **luôn** trả về cùng một câu, kể cả khi email không tồn tại, chưa
   * xác minh hay sai định dạng, và cả khi đã có mã còn hạn. Ba nhánh đầu giống
   * nhau vì trả lời khác nhau là công cụ dò email; nhánh "đã có mã còn hạn" cũng
   * phải giống vì người gọi không cần biết mình vừa bị chặn.
   *
   * Giới hạn theo tài khoản (1 email mỗi `RESET_TTL_MS`) là cần thiết bên cạnh
   * `ThrottleGuard` bên ngoài: IP dùng chung ở Việt Nam — văn phòng, trường, cả
   * tầng nhà — rất phổ biến, nên chặn theo IP không chặn được chuyện bơm mail vào
   * hộp thư của một người đã đăng ký. Ở đây chỉ chặn khi mã **còn hạn và chưa
   * dùng**: mã hết hạn hoặc đã dùng thì gửi lại được ngay, nên người dùng thật
   * không bị kẹt vì mail rơi mất.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const mail = String(email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) return { message: RESET_REQUESTED };
    const user = await this.db.user.findUnique({ where: { email: mail } });
    if (!user || !user.emailVerifiedAt) return { message: RESET_REQUESTED };

    const conHieu = (await this.db.userToken.findMany({
      where: { userId: user.id, type: 'reset_password' },
    })).some((r) => !r.usedAt && Date.now() < r.expiresAt.getTime());
    if (conHieu) return { message: RESET_REQUESTED };

    const raw = newToken();
    const row = await this.db.userToken.create({
      data: {
        userId: user.id, type: 'reset_password', tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    // Gửi **nền**, cố ý không `await`. `mail.send` là thứ nặng nhất của endpoint
    // này (SMTP: hàng trăm ms), nên nếu response chờ nó thì **thời gian phản hồi**
    // tự nó phân biệt được "email có tài khoản" với "email không có" — phá đúng
    // cái biện pháp "luôn trả cùng một câu" mà `login` đã dựng bằng `burnCompare`.
    // Ở đây `burnCompare` không cứu được: số hạng lớn nhất là SMTP chứ không phải
    // bcrypt, nên phải bỏ chờ chứ không phải thêm một vòng so bằng.
    //
    // Đổi lại: không retry, không backpressure. Chấp nhận được vì người dùng luôn
    // xin lại được (cooldown 1 lần/tài khoản/giờ) và `AuthMailer` đã log lỗi gửi.
    this.mail
      .send({
        to: mail,
        subject: 'Đặt lại mật khẩu GoCode',
        text: `Chào bạn,\n\nLink này hết hạn sau 1 giờ:\n${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password?token=${raw}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.\n\nĐội ngũ GoCode`,
      })
      .catch((err: unknown) => {
        // Không im lặng: đường này chạy nền nên không có ai đỡ lỗi nếu ta nuốt.
        // (`AuthMailer` cũng log, nhưng `AuthMailPort` là abstraction — một
        // cài đặt khác hoàn toàn có thể không log gì.)
        this.logger.warn(
          `Gửi mail đặt lại mật khẩu tới ${mail} thất bại: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
        );
        // Trả lại mã vừa cấp. Giữ nó lại nghĩa là tài khoản đang cầm một mã còn
        // hạn mà không ai nhận được, và cooldown 1 giờ sẽ nuốt mọi lần xin lại —
        // tức một lần SMTP chết biến thành "quên mật khẩu bị treo 1 tiếng".
        return this.db.userToken
          .updateMany({ where: { id: { in: [row.id] } }, data: { usedAt: new Date() } })
          .catch(() => undefined);
      });
    return { message: RESET_REQUESTED };
  }

  /**
   * Vô hiệu **mọi** mã đặt lại của tài khoản, không chỉ mã vừa dùng.
   *
   * Lý do: cooldown cho phép mỗi tài khoản một mail mỗi giờ, nên một tài khoản có
   * thể còn **mã cũ còn hạn** đứng cạnh mã đang dùng. Nếu chỉ đánh dấu mã vừa
   * dùng thì kẻ giữ mã cũ vẫn đổi được mật khẩu lần nữa trong giờ còn lại — đúng
   * lúc chủ tài khoản đã đổi mật khẩu và tin là mình an toàn.
   *
   * `usedAt: null` trong điều kiện lọc là cố ý: dòng đã dùng giữ nguyên mốc thời
   * gian thực sự dùng, không bị một lần reset sau ghi đè. Mốc đó là dấu vết để
   * sau này tra mã nào bị dùng lúc nào, nên ghi đè là mất dấu vết.
   */
  private async burnResetTokens(userId: number): Promise<void> {
    await this.db.userToken.updateMany({
      where: { userId, type: 'reset_password', usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Đặt lại mật khẩu bằng mã một lần, rồi **xoá mọi phiên** chứ không chỉ phiên
   * đang dùng: nếu kẻ trộm được cookie trước khi chủ tài khoản đổi mật khẩu thì
   * chỉ đổi mật khẩu không cứu được — hắn vẫn vào app được, đúng lúc người dùng
   * tin mình đã an toàn.
   *
   * **Thứ tự ghi cố ý là vô hiệu mã → `logoutAll` → đổi mật khẩu.** Nếu đổi mật
   * khẩu trước rồi mới xoá phiên thì DB chết giữa chừng sẽ để lại đúng trạng
   * thái tệ nhất: mật khẩu đã đổi (chủ nhà tưởng an toàn) còn cookie của kẻ trộm
   * vẫn sống. Đảo thứ tự thì mọi nhánh lỗi đều an toàn — hoặc mật khẩu chưa đổi,
   * hoặc phiên đã xoá và người dùng chỉ cần đăng nhập lại. Không bọc
   * `$transaction` vì `logoutAll` dùng `this.db` chứ không dùng client của
   * transaction, nên bọc vào cũng không cho thêm tính nguyên tử nào — chỉ tạo cảm
   * giác an toàn giả (xem `task-10-report.md`).
   */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const pass = String(newPassword ?? '');
    // Đo độ dài **trước** khi tra cặp token: mật khẩu quá ngắn là lỗi dữ liệu của
    // người gọi, không phụ thuộc mã có hợp lệ hay không, nên không được để sau —
    // nếu sau thì request sai bị trả 400 mà request với mã chết thì trả `false`.
    if (pass.length < 8) throw new BadRequestException(PASSWORD_TOO_SHORT);
    const row = await this.db.userToken.findFirst({ where: { tokenHash: hashToken(String(token ?? '')) } });
    if (!row || row.type !== 'reset_password' || row.usedAt) return false;
    if (Date.now() >= row.expiresAt.getTime()) return false;

    await this.burnResetTokens(row.userId);
    await this.logoutAll(row.userId);
    await this.db.user.update({
      where: { id: row.userId },
      data: { passwordHash: await hashPassword(pass) },
    });
    return true;
  }

  async me(userId: number): Promise<PublicUser> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Phiên không hợp lệ');
    return this.toPublic(user);
  }
}
