import {
  BadRequestException, ConflictException, Injectable, Logger, OnModuleInit, UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.ts';
import { PremiumService } from '../premium/premium.service.ts';
import type { UserRole } from './auth.types.ts';
import { GOOGLE_PROVIDER, STATE_TTL_MS, consumeState, createState } from './oauth-state.ts';
import {
  hashPassword, hashToken, newToken, signAccessToken, verifyPassword,
} from './tokens.ts';

/**
 * Profile Google đã chuẩn hoá. `emailVerified` là **boolean thật**, không phải
 * giá trị thô của Google: `googleProfile` ép `email_verified === true` nên mọi
 * thứ không phải `true` (kể cả chuỗi `"true"` hay `"false"`) đều thành `false`.
 */
export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  /**
   * Ảnh đại diện từ `picture` của Google userinfo, hoặc `null` khi Google không
   * trả. `null` nghĩa là **không biết**, nên `linkOrCreateFromGoogle` không ghi
   * đè ảnh sẵn có bằng `null`.
   */
  avatarUrl: string | null;
};

/**
 * Bốn kết cục sau khi đã có profile Google.
 *
 * `needs-password` và `conflict` là hai câu trả lời **bắt buộc phải khác nhau**:
 * gộp lại thì hoặc bị lộ tài khoản nào đã tồn tại, hoặc phải bắt mọi người nhập
 * mật khẩu kể cả khi đang ghép tài khoản của chính mình.
 */
export type LinkResult =
  | { kind: 'ok'; userId: number }
  | { kind: 'needs-password'; email: string }
  | { kind: 'unverified' }
  | { kind: 'conflict' };

export type PublicUser = {
  id: number; email: string; name: string | null; role: UserRole;
  /** Ảnh đại diện, `null` với tài khoản không có ảnh nào. */
  avatarUrl: string | null;
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
/**
 * Cooldown gửi lại link xác nhận: **1 giờ mỗi tài khoản**, cùng mức với
 * `forgotPassword`.
 *
 * Cố ý **không** lấy `VERIFY_TTL_MS` (24 giờ) làm cửa sổ cooldown như
 * `forgotPassword` lấy `expiresAt` của mã: 24 giờ là hạn ta muốn cho *mã*, không
 * phải cho *nút gửi lại*. Lấy `expiresAt` làm cooldown thì mọi lần bấm trong suốt
 * 24 giờ đều bị chặn — kể cả đúng lúc người dùng cần nhất, tức mail đầu rơi mất
 * — nút chết đúng lúc sinh ra để chữa.
 */
const RESEND_COOLDOWN_MS = 60 * 60 * 1000;
/**
 * Chu kỳ quét dòng OAuth hết hạn. Mặc định 10 phút — bằng `STATE_TTL_MS` trong
 * `oauth-state.ts`: quét chậm hơn TTL nghĩa là dữ liệu thừa tồn tại lâu hơn cần
 * thiết, quét nhanh hơn chỉ là ghi thêm vào DB cho những gì không còn dùng.
 */
const OAUTH_SWEEP_INTERVAL_MS = STATE_TTL_MS;
const UA_MAX = 200;
/**
 * Ảnh đại diện chỉ được ghi vào DB khi là chuỗi không rỗng; mọi thứ khác trả
 * `null`. Lý do: `picture` là JSON từ Google và kiểu `GoogleProfile.avatarUrl` là
 * do **ta** khai, nên chỗ duy nhất phải phòng thủ trước là lúc ghi vào cột
 * `TEXT` — một object hay số ở đây là `PrismaClientValidationError`, tức callback
 * thành 500 và người dùng thấy màn trắng chỉ vì Google trả thêm một trường.
 */
function normalizeAvatarUrl(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}
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
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private oauthSweepInterval?: NodeJS.Timeout;

  constructor(
    private readonly db: DatabaseService,
    private readonly mail: AuthMailPort,
    private readonly premium: PremiumService,
  ) {}

  /**
   * Cùng khuôn `PremiumService.onModuleInit`: chạy lần đầu sau 30 giây để không
   * block startup, rồi lặp theo chu kỳ, `unref()` để process thoát được, và tắt
   * được bằng biến môi trường.
   *
   * `AuthService` là singleton mặc định của Nest nên chỉ có **một** instance và
   * chỉ một `onModuleInit` — không có nguy cơ mỗi request lại sinh một interval.
   */
  onModuleInit() {
    if (process.env.DISABLE_OAUTH_STATE_SWEEP === '1') {
      this.logger.log('Quét state OAuth tắt qua DISABLE_OAUTH_STATE_SWEEP=1');
      return;
    }
    const intervalMs = Number(process.env.OAUTH_STATE_SWEEP_INTERVAL_MS ?? OAUTH_SWEEP_INTERVAL_MS);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return;
    const quet = () => this.sweepExpiredOAuthStates().catch((e) => this.logger.error('Quét state OAuth lỗi', e as Error));
    setTimeout(quet, 30_000);
    this.oauthSweepInterval = setInterval(quet, intervalMs);
    if (this.oauthSweepInterval.unref) this.oauthSweepInterval.unref();
    this.logger.log(`Đã bật quét state OAuth hết hạn mỗi ${Math.round(intervalMs / 60000)} phút`);
  }

  /**
   * Xoá mọi dòng state đã hết hạn. Lọc **chỉ theo hạn**, không theo `usedAt`:
   * `consumeState` xoá dòng đã dùng rồi nên cột đó luôn null ở dòng còn lại, và
   * dòng `usedAt` từ bản deploy cũ cũng phải được dọn — cùng một điều kiện với
   * index `@@index([expiresAt])` trong schema.
   */
  private async sweepExpiredOAuthStates(): Promise<number> {
    const { count } = await this.db.userOAuthState.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    if (count > 0) this.logger.log(`Đã dọn ${count} dòng state OAuth hết hạn`);
    return count;
  }

  /**
   * Ký access token với role ĐÚNG tại thời điểm phát hạn.
   *
   * checkAndDowngradeIfExpired hạ VIP đã quá hạn trong DB, nên role trả về là
   * 'user' sau khi hạ và token ký theo đúng role đó. Nhờ vậy quyền truy cập đúng
   * ngay lần đăng nhập/refresh kế tiếp, không phụ thuộc quét định kỳ có chạy hay không
   * (trên Vercel serverless setInterval gần như không kêu).
   *
   * Chỉ hỏi thêm 1 lượt khi downgraded — lúc đó `removeVip` đã ghi role='user'
   * nên không cần đọc lại DB. Không hạ thì user.role vẫn còn nguyên hiệu lực.
   * Admin (`role='admin'`) không đi qua nhánh này vì wasVip sai.
   */
  private async roleForToken(userId: number, current: UserRole): Promise<UserRole> {
    const { downgraded } = await this.premium.checkAndDowngradeIfExpired(userId);
    return downgraded ? 'user' : current;
  }

  private toPublic(u: Record<string, unknown>): PublicUser {
    const role = String(u.role ?? 'user') as UserRole;
    return {
      id: Number(u.id),
      email: String(u.email),
      name: (u.name as string) ?? null,
      role,
      // `?? null` chứ không phải `as string`: cột nullable và mọi db giả trong
      // test đều có thể thiếu trường, mà `PublicUser` hứa `string | null` —
      // trả `undefined` là so sánh với `null` ở FE trượt.
      avatarUrl: (u.avatarUrl as string) ?? null,
    };
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
    const { mail: msg } = await this.issueVerification(user.id, mail, userAgent);
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
   *
   * Trả kèm `tokenId` của dòng vừa tạo: `resendVerification` cần nó để **trả lại
   * mã** khi gửi mail hỏng. Không trả thì một lần SMTP chết sẽ khóa chính tài
   * khoản đó trong `RESEND_COOLDOWN_MS` với một mã không ai nhận được — cùng lỗi
   * mà Task 10 đã phải sửa cho `forgotPassword`.
   */
  private async issueVerification(
    userId: number, to: string, userAgent?: string,
  ): Promise<{ mail: Mail; tokenId: string }> {
    const raw = newToken();
    const row = await this.db.userToken.create({
      data: {
        userId, type: 'verify_email', tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
        userAgent: userAgent?.slice(0, UA_MAX) ?? null,
      },
    });
    return {
      tokenId: row.id,
      mail: {
        to,
        subject: 'Xác nhận email để hoàn tất đăng ký GoCode',
        text: `Chào bạn,\n\nMã xác nhận của bạn hết hạn sau 24 giờ:\n${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/sign-up?token=${raw}\n\nĐội ngũ GoCode`,
      },
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
    return { ...(await this.issueSession(user, userAgent)), user: this.toPublic(user) };
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
   * **Chỗ duy nhất** trong `AuthService` gọi `signAccessToken`.
   *
   * Không gom vào `issueSession` thì mỗi nơi phát token sẽ tự viết
   * `signAccessToken(...)`, và một chỗ quên gọi `roleForToken` là user VIP quá
   * hạn vẫn nhận token mang `role=vip` — mà `tsc` không báo gì vì kiểu trả về
   * y hệt nhau. Tách ra thành một hàm thì chỗ bỏ sót không còn tồn tại.
   */
  private async signFor(user: { id: number; role?: unknown }): Promise<string> {
    return signAccessToken(
      user.id,
      await this.roleForToken(user.id, (user.role as UserRole) ?? 'user'),
    );
  }

  /**
   * Cấp **phiên mới**: access token + một dòng `UserToken` refresh.
   *
   * `trimSessions` để **ngoài** hàm này: `login` cắt phiên cũ còn
   * `verifyEmail` thì không, và việc đó là hành vi đã có sẵn. `refresh` không
   * đi qua đây vì nó xoay vòng dòng phiên sẵn có chứ không tạo dòng mới.
   */
  private async issueSession(
    user: { id: number; role?: unknown },
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.signFor(user);
    const refreshToken = await this.issueRefresh(user.id, userAgent);
    return { accessToken, refreshToken };
  }

  /**
   * Gửi lại link xác nhận cho tài khoản **chưa** xác minh.
   *
   * Nút "Gửi lại link" ở màn "kiểm tra hộp thư" không thể gọi lại `register`: tài
   * khoản vừa đăng ký thì chắc chắn đã tồn tại, nên `register` ném 409 và không
   * gửi mail — nút đó chết đúng lúc cần nhất.
   *
   * Cùng nguyên tắc chống lộ trạng thái với `forgotPassword`: **luôn** trả về
   * `RESEND_SENT`, kể cả khi email không tồn tại, đã xác minh rồi, sai định
   * dạng, hay đang trong thời gian chờ. Bốn nhánh đầu trả lời khác nhau chính là
   * công cụ dò email; khác biệt phải nằm ở việc có tạo mã và gửi mail hay không.
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

    // Cooldown theo **tài khoản**, y hệt `forgotPassword`. `ThrottleGuard` ở
    // controller chỉ biết IP, mà IP dùng chung ở Việt Nam — văn phòng, trường,
    // cả tầng nhà — rất phổ biến, nên chặn theo IP không chặn được chuyện bơm
    // mail vào hộp thư của một người đã đăng ký: bấm nút năm lần là năm mail.
    // Chỉ chặn khi mã **còn trong cửa sổ cooldown**; mã đã dùng (kể cả mã mà
    // chính nhánh dưới đánh dấu vì mail hỏng) thì gửi lại được ngay, nên người
    // dùng thật không bị kẹt vì mail rơi mất.
    const conHieu = (await this.db.userToken.findMany({
      where: { userId: user.id, type: 'verify_email' },
    })).some((r) => !r.usedAt && Date.now() < r.createdAt.getTime() + RESEND_COOLDOWN_MS);
    if (conHieu) return { message: RESEND_SENT };

    const { mail: msg, tokenId } = await this.issueVerification(user.id, mail, userAgent);
    this.mail.send(msg).catch((err: unknown) => {
      // Không nuốt im lặng: đường này chạy nền nên không có ai đỡ lỗi. Chỉ log —
      // y hệt `forgotPassword` (kể cả lý do không được bỏ qua `AuthMailer` tự
      // log: `AuthMailPort` là abstraction, một cài đặt khác có thể im lặng).
      this.logger.warn(
        `Gửi lại mail xác nhận tới ${mail} thất bại: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
      );
      // Trả lại mã vừa cấp. Giữ nó lại nghĩa là tài khoản đang cầm một mã còn
      // hạn mà không ai nhận được, và cooldown 1 giờ sẽ nuốt mọi lần xin lại —
      // tức một lần SMTP chết biến thành "gửi lại link bị treo 1 tiếng".
      return this.db.userToken
        .updateMany({ where: { id: { in: [tokenId] } }, data: { usedAt: new Date() } })
        .catch(() => undefined);
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

    const tokens = await this.issueSession(user, userAgent);
    await this.trimSessions(user.id);
    return { ...tokens, user: this.toPublic(user) };
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
    const accessToken = await this.signFor(user);
    return { accessToken, refreshToken: fresh, user: this.toPublic(user) };
  }

  /**
   * `userId` mà một refresh token **đang dùng được** thuộc về, hoặc `null`.
   *
   * Cửa sổ hẹp hơn `refresh()` có chủ đích: hàm này **chỉ đọc**, không cấp token mới
   * và **không xoá dòng phiên** — nó phục vụ cho câu hỏi "phiên này của ai", không
   * phục vụ cho "làm mới phiên". Việc kiểm token thì đi qua `findRotatable`, cùng hàm
   * và cùng điều kiện với `refresh()`, nên "dùng được" ở đây và ở đó **không thể
   * lệch nhau**: cùng kiểu token, cùng `expiresAt`, cùng đệm 30 giây, cùng từ chối
   * dòng không phải phiên refresh.
   */
  async userIdForRefresh(token: string): Promise<number | null> {
    const live = await this.findRotatable(hashToken(String(token ?? '')));
    return live ? live.userId : null;
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

  /**
   * Lấy profile từ Google bằng authorization code.
   *
   * Trả `null` khi thiếu cấu hình hoặc Google lỗi: đó là tình trạng triển khai,
   * không phải lỗi của người dùng, nên không được ném 500 làm nút Google báo
   * "tài khoản của bạn sai" một cách vô lý.
   */
  async googleProfile(code: string, codeVerifier: string): Promise<GoogleProfile | null> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      this.logger.warn('Chưa cấu hình GOOGLE_CLIENT_ID/CLIENT_SECRET/REDIRECT_URI — bỏ qua OAuth');
      return null;
    }
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    if (!res.ok) {
      this.logger.warn(`Google trả ${res.status} khi đổi code`);
      return null;
    }
    const tok = (await res.json()) as { access_token?: string };
    if (!tok.access_token) return null;

    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!info.ok) {
      this.logger.warn(`Google trả ${info.status} khi lấy userinfo`);
      return null;
    }
    const raw = (await info.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: unknown;
    };
    if (!raw.sub || !raw.email) return null;
    return {
      sub: raw.sub,
      email: raw.email,
      // `=== true`, không phải truthy: JSON của Google không hứa kiểu dữ liệu, và
      // chuỗi `"false"` thì truthy — dùng phép kiểm tra truthy ở đây là mọi
      // profile không xác minh đều đi lọt.
      emailVerified: raw.email_verified === true,
      name: raw.name ?? null,
      // `typeof === 'string'` vì `picture` là JSON bên ngoài: số hay object đều
      // không được lọt vào cột TEXT, và `.trim()` vì URL bọc khoảng trắng là URL
      // hỏng. `picture` thiếu là chuyện bình thường (tài khoản Google không đặt
      // ảnh) nên đây không phải lý do để bỏ cả luồng đăng nhập.
      avatarUrl: typeof raw.picture === 'string' ? raw.picture.trim() || null : null,
    };
  }

  /**
   * Bốn nhánh xử lý tài khoản sau khi đã có profile Google.
   *
   * Nhánh `needs-password` là **ranh giới bảo mật**: nếu tự ghép theo email thì
   * kẻ nào đăng ký Google với email của bạn cũng vào được tài khoản bạn. Nên khi
   * email đã tồn tại mà người dùng chưa đăng nhập, ta bắt họ đăng nhập bằng
   * mật khẩu trước — bấm lại nút Google lúc đó sẽ rơi vào nhánh `ok`.
   *
   * Khớp theo `sub`, không theo email: `sub` ổn định, email thì Google cho đổi.
   * Một `sub` chỉ được gắn vào một user (khoá unique `(provider, providerUserId)`
   * ở DB), nên nếu nó đã thuộc về user khác thì báo `conflict` chứ không ghép lại.
   *
   * `conflict` **phải log** chứ không trả rồi im: đây là sự kiện không bao giờ
   * xảy ra trong vận hành bình thường, nên đúng lúc nó xảy ra thì log là thứ duy
   * nhất chỉ ra. Chỉ `id` và `sub` — **không** log `email`: đó là PII, và log ở
   * đây đang ở chế độ công khai.
   */
  /**
   * Đồng bộ ảnh đại diện từ Google cho một user **đã tồn tại**.
   *
   * Gọi ở cả hai nhánh trả `ok`, không chỉ lúc tạo user: người dùng đổi ảnh
   * Google giữa chừng là chuyện thật, mà lần đăng nhập kế tiếp đi qua `existingLink`
   * chứ không qua nhánh tạo mới — bỏ hàm này ở đây là ảnh đóng băng ở lần đầu.
   *
   * **`null` = không biết, không phải "không có ảnh".** Không thấy `picture` thì
   * bỏ trống, tuyệt đối không `update` `avatarUrl` thành `null`: một lần Google
   * không gửi `picture` sẽ xoá mất ảnh người dùng đã có. Xoá ảnh thật là việc
   * của người dùng, không phải của lần đăng nhập im tiếng.
   */
  private async syncAvatarUrl(userId: number, avatarUrl: string | null): Promise<void> {
    const clean = normalizeAvatarUrl(avatarUrl);
    if (!clean) return;
    await this.db.user.update({ where: { id: userId }, data: { avatarUrl: clean } });
  }

  async linkOrCreateFromGoogle(
    p: GoogleProfile,
    signedInUserId: number | null,
  ): Promise<LinkResult> {
    // `!== true` chứ không phải `!p.emailVerified`: chuỗi `"false"` cũng truthy,
    // nên phép kiểm tra truthy là mọi profile không xác minh đều qua được cửa
    // này. Chặn ở đây, trước cả lần tra cặp nào với DB.
    if (p.emailVerified !== true) return { kind: 'unverified' };

    // Chuẩn hoá **một lần** rồi dùng biến này cho cả tra cứu lẫn tạo mới.
    // `User.email` là `TEXT @unique` nên Postgres phân biệt hoa/thường: tra
    // bằng đúng chuỗi Google trả thì `A@B.CO` không khớp dòng `a@b.co` đã có,
    // `findUnique` trượt và ta rơi xuống nhánh tạo user mới — tức ranh giới
    // "email đã tồn tại mà chưa đăng nhập thì không ghép" mở lỗ (fail-open)
    // đúng vào lúc quan trọng nhất. Mọi đường ghi khác trong file đều đã
    // `.trim().toLowerCase()`, chỗ này là ngoại lệ đã tạo ra lỗ hổng.
    const email = String(p.email).trim().toLowerCase();

    const existingLink = await this.db.userAccount.findUnique({
      where: { provider_providerUserId: { provider: GOOGLE_PROVIDER, providerUserId: p.sub } },
    });
    if (existingLink) {
      // Đã đăng nhập mà khác user thì `sub` này đang bị kéo sang tài khoản khác —
      // trả `conflict` thay vì trả `ok`, kẻ ghép sẽ vào nhầm tài khoản người khác.
      if (signedInUserId !== null && existingLink.userId !== signedInUserId) {
        this.logger.warn(
          `Google conflict: sub đã gắn vào user khác (linkUserId=${existingLink.userId}, ` +
            `signedInId=${signedInUserId}, sub=${p.sub})`,
        );
        return { kind: 'conflict' };
      }
      await this.syncAvatarUrl(existingLink.userId, p.avatarUrl);
      return { kind: 'ok', userId: existingLink.userId };
    }

    const byEmail = await this.db.user.findUnique({ where: { email } });
    if (byEmail) {
      // Email đã có mà chưa đăng nhập: KHÔNG ghép, kể cả khi `sub` chưa từng
      // xuất hiện. Ghép ở đây là lỗ hổng chiếm tài khoản theo email.
      if (signedInUserId === null) return { kind: 'needs-password', email };
      if (byEmail.id !== signedInUserId) {
        this.logger.warn(
          `Google conflict: email trùng với user khác (emailUserId=${byEmail.id}, ` +
            `signedInId=${signedInUserId}, sub=${p.sub})`,
        );
        return { kind: 'conflict' };
      }
      await this.db.userAccount.create({
        data: { userId: byEmail.id, provider: GOOGLE_PROVIDER, providerUserId: p.sub },
      });
      await this.syncAvatarUrl(byEmail.id, p.avatarUrl);
      return { kind: 'ok', userId: byEmail.id };
    }

    let created;
    try {
      created = await this.db.user.create({
        data: {
          email,
          name: p.name,
          // Email do Google xác minh rồi, và không có đường nào để gửi mã xác
          // minh tới hộp thư đó: để `emailVerifiedAt` null thì tài khoản vừa
          // sinh ra sẽ bị `login` chặn vĩnh viễn.
          emailVerifiedAt: new Date(),
          avatarUrl: normalizeAvatarUrl(p.avatarUrl),
          // Không có mật khẩu: user này chỉ dùng Google. `passwordHash` để null
          // — đó là tín hiệu mà `login` dựa vào để biết tài khoản không đăng
          // nhập được bằng mật khẩu, và sinh một mật khẩu ngẫu nhiên ở đây là
          // tạo ra bí mật không ai giữ.
          role: 'user',
        },
      });
    } catch (e) {
      // Không dùng `createUser()` vì hàm đó dịch P2002 thành `409` — trong
      // callback OAuth thì `409` là màn trắng, còn `needs-password` là câu
      // dẫn người dùng đi tiếp. Đây là race thật: hai callback cùng dùng một
      // email mới, cả hai tra `findUnique` đều trượt rồi cùng `create`.
      //
      // `P2002` nghĩa là email **đã có trong DB** mà tra cứu không khớp — tức
      // đúng nghĩa "tài khoản đã tồn tại", nên trả `needs-password` là
      // fail-closed đúng ranh giới: bắt họ chứng minh bằng mật khẩu, không
      // cấp phiên cho ai. Lỗi khác thì ném nguyên để không giả làm trùng email.
      if ((e as { code?: string })?.code === 'P2002') {
        this.logger.warn(`Google race tạo user: email đã tồn tại, trả needs-password (sub=${p.sub})`);
        return { kind: 'needs-password', email };
      }
      throw e;
    }
    await this.db.userAccount.create({
      data: { userId: created.id, provider: GOOGLE_PROVIDER, providerUserId: p.sub },
    });
    return { kind: 'ok', userId: created.id };
  }

  /**
   * Mở phiên đăng nhập Google: sinh `state` + `code_verifier` và ghi vào
   * `UserOAuthState`. Controller không tự chạm DB (không route nào khác của
   * `auth` làm thế), nên đây là chỗ duy nhất nó đi qua.
   *
   * `redirectTo` vẫn được `createState` chạy `safeInternalPath` lần nữa: đầu
   * vào tới từ trình duyệt, và lớp ở biên không thay thế được lớp ở sâu.
   */
  async beginGoogleOAuth(
    redirectTo: string,
  ): Promise<{ state: string; codeVerifier: string }> {
    return createState(this.db, redirectTo);
  }

  /** Ăn `state` một lần rồi chết. `null`: state sai, hết hạn, hoặc đã dùng. */
  async takeGoogleState(
    state: string,
  ): Promise<{ codeVerifier: string; redirectTo: string } | null> {
    return consumeState(this.db, state);
  }

  /**
   * Cấp phiên cho một user **đã xác định** — cửa duy nhất để luồng OAuth phát
   * token, và nó đi qua `issueSession` nên không bỏ qua `roleForToken`.
   *
   * Trả `null` chứ không ném khi user không còn: `linkOrCreateFromGoogle` vừa
   * trả `userId`, nên `null` ở đây là việc dữ liệu vừa đổi giữa chừng; ném ra
   * sẽ biến callback thành 500, đúng cái mà `googleProfile` tránh bằng `null`.
   */
  async issueSessionForUserId(
    userId: number,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const tokens = await this.issueSession(user, userAgent);
    await this.trimSessions(user.id);
    return tokens;
  }
}
