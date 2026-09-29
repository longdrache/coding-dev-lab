import { resendVerification, submitCredentials, type AuthMode } from "./auth-form";

/**
 * Trạng thái chờ và hạn thời gian của hai nút gửi ở màn đăng nhập / đăng ký.
 *
 * `vitest.config.ts` chạy `environment: 'node'` và chỉ nạp `*.test.ts`, nên
 * không dựng được `AuthForm`. Vì vậy **mọi quyết định** — có cho bấm lần hai
 * không, chờ bao lâu, hết giờ thì nói gì, phân biệt lỗi nào với lỗi nào — nằm ở
 * đây và có test. `AuthForm.tsx` chỉ còn nối state này với DOM, đúng như
 * `avatarMenu`/`createAvatarHover` với menu tài khoản.
 *
 * Ba thứ ở đây đều là **lỗi thật đã xảy ra**, không phải cải thiện thẩm mỹ:
 * bấm hai lần làm `/register` chạy hai lần (lần hai 409 và **không gửi mail**,
 * nên người dùng bị bỏ lại ở màn "kiểm tra hộp thư" không bao giờ có mail), và
 * server không trả lời thì nút quay vòng vô hạn, không có đường ra ngoài trừ
 * việc tải lại trang.
 */

/** Việc đang chờ server: gửi thông tin đăng nhập/đăng ký, hay phát lại link xác nhận. */
export type AuthAction = "submit" | "resend";

/**
 * Chỗ đang chờ. `null` = rảnh.
 *
 * Mang cả `mode` vì hai chế độ phải nói khác nhau khi đang chờ: "Đang đăng nhập…"
 * và "Đang tạo tài khoản…" là hai việc ở hai route khác nhau, nói chung chung là
 * "Đang xử lý…" thì người dùng không biết mình đang chờ cái gì mà có thể làm
 * gì trong lúc đó.
 */
export type AuthPending = { action: AuthAction; mode: AuthMode } | null;

/**
 * Hạn chờ một lần gửi, tính bằng mili giây.
 *
 * **Vì sao 20 giây.** Đường đi thật của `/register` (chặn nhất) là: BE nhận
 * request → truy vấn Postgres ở Neon (mạng, 50–300ms) → `bcrypt.compare` hoặc
 * `bcrypt.hash` (60–150ms với cost 10) → **gửi mail qua SMTP Brevo** (1–3s,
 * có lúc tới 5s) → trả 200. Vậy một lần gửi hợp lệ nằm trong khoảng 0,3–5 giây;
 * thêm mạng di động yếu và DB chập chờn thì 8–10 giây vẫn là chuyện thật.
 *
 * - **Dưới 15 giây là cắt ngang việc hợp lệ**: người dùng mới đăng ký xong thì
 *   tài khoản **đã có** trong DB, nhưng link xác nhận chưa gửi xong. Báo hết
 *   giờ lúc đó là dạy họ bấm lại, mà bấm lại thì 409 — hỏng luôn.
 * - **Trên 30 giây là để ngồi nhìn**: người dùng không biết nút đang chờ hay
 *   đã chết, và cũng không biết mình có nên tải lại trang.
 *
 * 20 giây nằm giữa: gấp đôi đường đi tệ nhất, và trong khoảng mà người dùng
 * vẫn còn đang nhìn nút chứ chưa kịp đi làm việc khác. Nó cũng là hạn mà
 * `AbortSignal` cắt được ngay, thay vì để browser treo socket tới khi hết
 * thời gian chờ mặc định (vài phút, không ai biết).
 */
export const AUTH_TIMEOUT_MS = 20_000;

/**
 * Câu báo khi hết giờ.
 *
 * Khác hẳn câu lỗi chủ đích ("Email hoặc mật khẩu không đúng") và khác cả câu
 * lỗi mạng trong `auth-form.ts`: ở đây người dùng **chưa biết** thông tin của
 * mình có đúng không, vì server chưa hề trả lời. Nói "không kết nối được" thì
 * họ đi kiểm tra wifi rồi quay lại với câu hỏi cũ; nói "sai mật khẩu" thì là nói
 * dối. Vì vậy câu này nói đúng ba điều: đã chờ bao lâu, mình đã **dừng**, và
 * làm gì tiếp theo.
 *
 * **Vì sao phải khác nhau theo mode** mà không dùng một câu chung: BE tạo user
 * **trước** rồi mới gửi mail (`auth.service.ts`). Nên lúc hết giờ ở chế độ đăng
 * ký, tài khoản có thể **đã có trong DB**; bấm lại lúc đó là `/register` trả 409
 * và không gửi mail — tức lời khuyên "bấm lại" làm hỏng đúng thứ còn dở, và làm
 * người dùng tin là có lỗi với email của họ. Chỉ có một việc đúng ở ca đó: đi
 * kiểm tra hộp thư. Còn `/login` không sinh ra tài khoản nào, nên "bấm lại" là
 * đúng và là đủ.
 *
 * Dựng bằng template từ `AUTH_TIMEOUT_MS` để hai thứ không thể lệch nhau: đổi
 * hằng mà quên sửa câu thì người dùng được hứa một số giây khác với số giây họ
 * thật sự phải chờ — và tin sai đó còn tệ hơn không có câu.
 */
export function authTimeoutMessage(mode: AuthMode): string {
  const waited = `Máy chủ không phản hồi sau ${AUTH_TIMEOUT_MS / 1000} giây nên mình đã dừng lại.`;
  return mode === "signup"
    ? `${waited} Kiểm tra hộp thư trước: nếu link xác nhận đã tới thì tài khoản đã tạo xong, mở link là vào được. Chưa thấy link thì kiểm tra mạng rồi bấm lại.`
    : `${waited} Kiểm tra mạng rồi bấm lại — email và mật khẩu của bạn vẫn còn trong ô.`;
}

/**
 * Câu báo khi có lỗi mà ta không dự đoán được (lỗi của chính FE, `refresh()` ném,
 * …).
 *
 * Nó cố ý **không** tái sử dụng câu lỗi chủ đích cũ ("Không đăng nhập được. Thử lại
 * sau."): câu đó nói chuyện về thông tin người dùng trong khi thứ vừa hỏng là
 * phía ta, và câu này mở lời báo lỗi — cần có ai đọc được thì mới sửa được.
 */
export const UNEXPECTED_MESSAGE =
  "Có lỗi khiến mình không xử lý xong. Kiểm tra mạng rồi bấm lại; nếu vẫn bị thì báo lại giúp mình.";

/**
 * Hạn chờ có thể huỷ, cấp `signal` cho `fetch` và tự biết mình đã hết giờ chưa.
 *
 * Vì sao tự viết thay vì dùng `AbortSignal.timeout()`: ta **phải** huỷ được
 * timer khi request xong sớm. `AbortSignal.timeout` không có đường huỷ, nên mỗi
 * lần đăng nhập thành công là một timer còn treo tới hết 20 giây — và ở lượt kế
 * tiếp nó vẫn nổ, huỷ `signal` của một request đã xong xuôi.
 *
 * `timedOut()` là **nguồn sự thật duy nhất** cho câu "hết giờ" chứ không phải suy
 * từ message trả về: `fetch` bị huỷ cũng ném `AbortError` y hệt lúc mất mạng, và
 * nếu phân biệt bằng message thì hết giờ sẽ hiện thành "không kết nối được" —
 * đúng loại nhập nhằng mà cả bài này sửa.
 */
export type Deadline = {
  /** Đưa vào `fetch` để hết giờ thì **cắt** request, không chỉ ngừng chờ. */
  signal: AbortSignal;
  /** `true` khi và chỉ khi chính timer của hạn này đã nổ. */
  timedOut(): boolean;
  /** Huỷ timer. Gọi được sau khi đã nổ, không ném. */
  clear(): void;
};

export function createDeadline(ms: number = AUTH_TIMEOUT_MS): Deadline {
  // `setTimeout` xử lý số vô lý mỗi ca một kiểu: `NaN` thành 0 tức thì (huỷ
  // request ngay lập tức), số âm cũng tức thì. Rơi về hằng để chủ động quyết,
  // y hệt `refreshPlan` trong `api.ts` không để timer tự quyết.
  const wait = Number.isFinite(ms) && ms > 0 ? ms : AUTH_TIMEOUT_MS;
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, wait);
  return {
    signal: controller.signal,
    timedOut: () => expired,
    clear: () => clearTimeout(timer),
  };
}

/** Lệnh component sẽ nhận. Rỗng ở `setError`/`setNotice` nghĩa là xoá. */
export type AuthEffects = {
  setPending(next: AuthPending): void;
  setError(message: string): void;
  setNotice(message: string): void;
  /** Chuyển sang màn kết quả: `sent` = đã gửi link, `signedin` = đã có phiên. */
  setDone(kind: "sent" | "signedin"): void;
  refresh(): Promise<void>;
};

export type AuthRequest = {
  action: AuthAction;
  mode: AuthMode;
  email: string;
  password: string;
  /** Chỉ để test và trường hợp đặc biệt; mặc định là `AUTH_TIMEOUT_MS`. */
  timeoutMs?: number;
};

export type AuthRunner = {
  run(req: AuthRequest, effects: AuthEffects): Promise<void>;
};

/**
 * Câu hiện trên nút lúc đang chờ, hoặc `""` khi không chờ gì.
 *
 * Nói **cái gì** đang chờ, không phải "đang xử lý". Người dùng bấm xong nhìn
 * nút trắng quay vòng sẽ tưởng bị treo; thấy "Đang tạo tài khoản…" thì biết
 * chỉ cần đợi, còn "Đang gửi lại link…" thì biết phải đi mở hộp thư.
 */
export function pendingLabel(pending: AuthPending): string {
  if (pending === null) return "";
  if (pending.action === "resend") return "Đang gửi lại link…";
  return pending.mode === "signup" ? "Đang tạo tài khoản…" : "Đang đăng nhập…";
}

/**
 * Một lần gửi, có chốt bấm hai lần và chốt hết giờ.
 *
 * Giữ trạng thái đang chờ **bên trong** runner chứ không đọc từ state của
 * component: state React là ảnh chụp theo lần render, nên một lần bấm thứ hai
 * trong cùng lúc render có thể đọc ra `null` và chạy thêm một lần gọi nữa. Chỗ
 * này là biến thật, nên bấm lần hai luôn bị chặn, kể cả khi `disabled` của nút
 * chưa kịp được vẽ lại.
 *
 * `effects` truyền vào **mỗi lần gọi** chứ không lúc khởi tạo: runner được giữ
 * trong ref qua suốt vòng đời component, nên nó không được giữ closure của
 * render đầu tiên — `refresh()` lấy từ đó có thể đã cũ.
 */
export function createAuthRunner(): AuthRunner {
  let pending: AuthPending = null;

  async function run(req: AuthRequest, effects: AuthEffects): Promise<void> {
    /* Chốt bấm hai lần. Trả về nguyên trạng: không báo lỗi, không đụng state —
     * lần bấm thừa là do người dùng, không phải một sự cố cần câu chữ. */
    if (pending !== null) return;

    const slot: AuthPending = { action: req.action, mode: req.mode };
    pending = slot;
    /* Báo chờ **đồng bộ**, trước mọi `await`. Đặt sau `await` thì nút đứng y
     * thêm một nhịp — đúng cảm giác "bấm không ăn" mà bài này sửa. */
    effects.setPending(slot);
    effects.setError("");
    if (req.action === "resend") effects.setNotice("");

    const deadline = createDeadline(req.timeoutMs);

    /**
     * Báo hết giờ nếu đã hết, trả `true` để chỗ gọi dừng lại ngay.
     *
     * Đọc cờ hạn TRƯỚC khi xử lý kết quả: lúc này `fetch` đã ném `AbortError` và
     * `submitCredentials` đã dịch sẵn thành câu lỗi mạng, nên xử lý `r` trước
     * thì hết giờ sẽ hiện thành "không kết nối được" — mất đúng thông tin người
     * dùng cần để biết mình có phải chờ thêm nữa không.
     */
    function stopIfTimedOut(): boolean {
      if (!deadline.timedOut()) return false;
      effects.setError(authTimeoutMessage(req.mode));
      return true;
    }

    try {
      if (req.action === "resend") {
        const r = await resendVerification(req.email, deadline.signal);
        if (stopIfTimedOut()) return;
        if (r.kind === "error") {
          effects.setError(r.message);
          return;
        }
        effects.setNotice(r.message);
        return;
      }

      const r = await submitCredentials(req.mode, req.email, req.password, deadline.signal);
      if (stopIfTimedOut()) return;
      if (r.kind === "error") {
        effects.setError(r.message);
        return;
      }
      if (req.mode === "signup") {
        /* `/register` trả 200 mà KHÔNG đặt cookie phiên
         * (`auth.controller.ts:123`): tài khoản mới chỉ dùng được sau khi mở
         * link xác nhận. Gọi `refresh()` ở đây đọc `/me` ra `null` và bỏ người
         * dùng ở trang trắng không có dòng giải thích nào. */
        effects.setDone("sent");
        return;
      }
      /* `refresh` phải xong **trước** khi báo đã vào: `AuthProvider` cần kịp đọc
       * lại `/me` và giữ token trong bộ nhớ, nếu không thì trang chủ dựng lên với
       * `user = null` rồi đá người dùng về `/sign-in` — tức đăng nhập xong thì bị
       * đuổi. */
      await effects.refresh();
      effects.setDone("signedin");
    } catch (err) {
      /* Cùng nguyên tắc đã áp cho mail ở `1fafdaa`: câu cho người dùng không
       * chứa chi tiết kỹ thuật, nhưng lỗi gốc phải còn đủ để chẩn đoán. Nuốt
       * trắng thì lúc này có người hỏi "sao form hỏng" thì không ai trả lời
       * được vì sao. `submitCredentials` tự dịch lỗi mạng rồi nên tới đây là
       * lỗi của chính FE hoặc của `refresh()`. */
      console.error("[auth] một lần gửi thất bại ngoài dự kiến", err);
      effects.setError(deadline.timedOut() ? authTimeoutMessage(req.mode) : UNEXPECTED_MESSAGE);
    } finally {
      /* Huỷ timer ở `finally` chứ không ở từng nhánh: sót một nhánh là sót
       * timer, và timer sót sẽ nổ giữa lượt gửi kế tiếp rồi huỷ `signal` của
       * một request đã xong. `clear()` không ném kể cả khi đã nổ. */
      deadline.clear();
      pending = null;
      effects.setPending(null);
    }
  }

  return { run };
}
