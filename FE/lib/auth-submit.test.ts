import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UNEXPECTED_MESSAGE,
  authTimeoutMessage,
  AUTH_TIMEOUT_MS,
  createAuthRunner,
  createDeadline,
  pendingLabel,
  type AuthEffects,
  type AuthPending,
} from './auth-submit';
import { RESEND_URL, authEndpoint } from './auth-form';
import { API_URL } from './swr';

/**
 * Phản hồi khi bấm + giới hạn thời gian chờ, kiểm bằng **timer giả**.
 *
 * Không `sleep` thật ở đâu cả: `vi.advanceTimersByTimeAsync` nhảy thẳng tới mốc
 * 20 giây nên cả bộ test chạy tức thì, và quan trọng hơn là **thất bại thì đỏ
 * thật** — một test chờ thật 20 giây thì tác giả sẽ xoá luôn khi nó đỏ vì chậm.
 *
 * `vitest.config.ts` chạy `environment: 'node'` và chỉ nạp `*.test.ts`, nên
 * không dựng được `AuthForm`. Đây là lý do toàn bộ phần quyết định nằm ở
 * `@/lib/auth-submit`: component chỉ còn nối DOM với state, còn chốt bấm hai lần
 * và hết giờ thì ở đây, có test bảo vệ.
 *
 * Không phụ thuộc `.env` của máy: `API_URL` đọc `process.env` **lúc nạp module**,
 * nên mọi assert về URL đều so với chính hằng `authEndpoint`/`RESEND_URL` thay
 * vì gõ cứng `http://localhost:4000` (bài học `f4d04c4`).
 */

const OLD_ENV = { ...process.env };

/** `Error` có tên `AbortError` — không phụ thuộc `DOMException` của môi trường. */
function abortError(): Error {
  return Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
}

/** Response giả của fetch, chỉ cần các trường thật sự được đọc. */
function stubFetchOk(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Đúng hình dạng lỗi của Nest: `{ statusCode, message, error }`. */
function stubFetchNestError(status: number, message: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ statusCode: status, message, error: 'Bad Request' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Fetch **không bao giờ trả lời**, nhưng vẫn nghe `signal` và ném `AbortError` khi
 * bị huỷ — đúng như trình duyệt. Bản fake chỉ treo thì sẽ che mất lỗi quan
 * trọng nhất của cơ chế này: timeout phải **cắt** request, không chỉ ngừng chờ.
 */
function stubFetchHangs() {
  const fetchMock = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(abortError()));
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Ghi lại mọi lệnh component sẽ nhận, kèm thứ tự, để assert thứ tự cũng được. */
function harness(overrides: Partial<AuthEffects> = {}) {
  const calls: string[] = [];
  const seen: {
    pending: AuthPending[];
    errors: string[];
    notices: string[];
    done: string[];
    refreshes: number;
  } = { pending: [], errors: [], notices: [], done: [], refreshes: 0 };

  const effects: AuthEffects = {
    setPending(next) {
      seen.pending.push(next);
      calls.push(next === null ? 'pending:null' : `pending:${next.action}`);
    },
    setError(message) {
      seen.errors.push(message);
      calls.push(`error:${message}`);
    },
    setNotice(message) {
      seen.notices.push(message);
      calls.push(`notice:${message}`);
    },
    setDone(kind) {
      seen.done.push(kind);
      calls.push(`done:${kind}`);
    },
    async refresh() {
      seen.refreshes += 1;
      calls.push('refresh');
    },
    ...overrides,
  };

  return { seen, effects, calls };
}

/** Nhảy tới mốc hết giờ rồi chờ chuỗi promise kịp chạy hết. */
async function jumpToTimeout(): Promise<void> {
  await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS);
}

/** Câu lỗi cuối cùng đã hiện ra, `""` khi chưa có. */
function lastError(seen: { errors: string[] }): string {
  return seen.errors[seen.errors.length - 1] ?? "";
}

const SIGNIN = { action: 'submit', mode: 'signin', email: 'hs@gocode.vn', password: 'matkhau123' } as const;
const SIGNUP = { action: 'submit', mode: 'signup', email: 'hs@gocode.vn', password: 'matkhau123' } as const;
const RESEND = { action: 'resend', mode: 'signup', email: 'hs@gocode.vn', password: '' } as const;

beforeEach(() => {
  vi.useFakeTimers();
  process.env = { ...OLD_ENV };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  process.env = { ...OLD_ENV };
});

describe('hợp đồng thời gian chờ', () => {
  it('hạn chờ là 20 giây', () => {
    // Số này là hợp đồng, không phải tuỳ chọn. Lý do chọn nằm ngay dưới hằng ở
    // `auth-submit.ts`; test ghim lại để đổi số phải kèm lý do.
    expect(AUTH_TIMEOUT_MS).toBe(20_000);
  });

  it('câu hết giờ nói đúng số giây đang chờ, không lệch với hằng', () => {
    // Hai nơi một luật: đổi hằng mà quên sửa câu thì người dùng được hứa một số
    // giây khác với số giây họ thật sự phải chờ.
    for (const mode of ['signin', 'signup'] as const) {
      expect(authTimeoutMessage(mode)).toContain('20 giây');
    }
  });

  it('hết giờ lúc đăng ký thì bảo kiểm tra hộp thư, KHÔNG bảo bấm lại', () => {
    // Đây là cái bẫy của câu chung: BE tạo user **trước** rồi mới gửi mail
    // (`auth.service.ts`). Nếu người dùng bấm lại ở đúng lúc đó thì `/register`
    // trả 409 và **không gửi mail** — bấm lại là làm hỏng đúng thứ còn dở. Họ
    // phải đi kiểm tra hộp thư trước đã.
    const signup = authTimeoutMessage('signup');
    expect(signup).toContain('hộp thư');
    // "bấm lại" vẫn được nhắc, nhưng **sau** khi bảo kiểm tra hộp thư. Nếu nó
    // đứng trước thì lời khuyên đầu tiên người đọc thấy lại là cái làm hỏng
    // việc.
    expect(signup.indexOf('hộp thư')).toBeLessThan(signup.indexOf('bấm lại'));
  });

  it('hết giờ lúc đăng nhập thì bảo bấm lại, vì không có gì đã tạo ra', () => {
    // Ngược lại: `/login` không sinh ra tài khoản nào, nên bấm lại là đúng và
    // là điều duy nhất cần làm.
    const signin = authTimeoutMessage('signin');
    expect(signin).toContain('bấm lại');
    expect(signin).not.toContain('hộp thư');
  });

  it('hạn chờ đủ rộng cho việc hợp lệ nhưng không vô hạn', () => {
    // Dưới 15s là cắt ngang bcrypt + gửi mail trên đường chậm; trên 30s là để
    // người dùng ngồi nhìn nút quay vòng mà không có cách nào thoát.
    expect(AUTH_TIMEOUT_MS).toBeGreaterThanOrEqual(15_000);
    expect(AUTH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('pendingLabel — nói rõ đang chờ việc gì', () => {
  it('đăng nhập, đăng ký và gửi lại là ba câu khác nhau', () => {
    // "Đang xử lý…" nói cho người dùng biết có gì đó đang chạy mà không nói
    // **cái gì**. Người dùng bấm xong phải biết mình đang chờ đăng nhập hay đang
    // chờ mail xác nhận, vì hai việc đó xử lý ở hai nơi khác nhau.
    const labels = [
      pendingLabel({ action: 'submit', mode: 'signin' }),
      pendingLabel({ action: 'submit', mode: 'signup' }),
      pendingLabel({ action: 'resend', mode: 'signup' }),
    ];
    expect(labels[0]).toBe('Đang đăng nhập…');
    expect(labels[1]).toBe('Đang tạo tài khoản…');
    expect(labels[2]).toBe('Đang gửi lại link…');
    expect(new Set(labels).size).toBe(3);
  });

  it('không phải lúc chờ thì không hiện gì', () => {
    expect(pendingLabel(null)).toBe('');
  });
});

describe('createDeadline', () => {
  it('hết hạn thì báo đã hết giờ và huỷ signal', () => {
    const d = createDeadline(1_000);
    expect(d.timedOut()).toBe(false);
    expect(d.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1_000);

    expect(d.timedOut()).toBe(true);
    expect(d.signal.aborted).toBe(true);
  });

  it('clear() thì timer không bao giờ nổ, kể cả khi đã trôi qua hạn', () => {
    const d = createDeadline(1_000);
    d.clear();

    vi.advanceTimersByTime(10_000);

    expect(d.timedOut()).toBe(false);
    expect(d.signal.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clear() sau khi đã nổ không ném, vì lời gọi này chạy ở finally', () => {
    const d = createDeadline(1_000);
    vi.advanceTimersByTime(1_000);
    expect(() => d.clear()).not.toThrow();
  });

  it('số hạn vô lý thì rơi về hằng, không để setTimeout tự quyết', () => {
    // `setTimeout` xử lý `NaN` và số âm mỗi ca một kiểu: `NaN` thành 0 tức thì
    // (huỷ request ngay lập tức), số âm cũng tức thì. Cùng lý do mà
    // `refreshPlan` trong `api.ts` phải tự quyết thay `setTimeout`.
    for (const bad of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) {
      const d = createDeadline(bad);
      vi.advanceTimersByTime(AUTH_TIMEOUT_MS - 1);
      expect(d.timedOut(), `hạn ${bad}`).toBe(false);
      d.clear();
    }
  });
});

describe('bấm nút — phản hồi tức thì', () => {
  it('báo đang chờ ngay ở lần gọi đầu, không đợi server', () => {
    stubFetchHangs();
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    void runner.run(SIGNIN, effects);

    // Chưa `await` gì cả: trạng thái chờ phải có mặt **đồng bộ** ngay khi bấm.
    // Đợi tới microtask mới set thì nút vẫn đứng y thêm một nhịp — đúng cái cảm
    // giác "bấm không ăn" mà bài này sửa.
    expect(seen.pending).toEqual([{ action: 'submit', mode: 'signin' }]);
  });

  it('xoá lỗi cũ ngay khi bấm lại, để câu cũ không còn nằm lại', () => {
    stubFetchNestError(401, 'Email hoặc mật khẩu không đúng');
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    void runner.run(SIGNIN, effects);
    return vi.runAllTimersAsync().then(async () => {
      await Promise.resolve();
      expect(lastError(seen)).toContain('không đúng');

      stubFetchHangs();
      void runner.run(SIGNIN, effects);
      expect(seen.errors[seen.errors.length - 1]).toBe('');
    });
  });
});

describe('bấm hai lần — không được tạo hai lần đăng ký', () => {
  it('lần hai khi đang chờ thì không gọi API lần nữa', async () => {
    const fetchMock = stubFetchHangs();
    const runner = createAuthRunner();
    const { effects } = harness();

    const first = runner.run(SIGNUP, effects);
    await runner.run(SIGNUP, effects);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await jumpToTimeout();
    await first;
  });

  it('gửi lại link cũng dùng chung một chỗ đang chờ, không chạy song song', async () => {
    // Hai nút nằm ở hai màn khác nhau nhưng là **cùng một form instance**: bấm
    // "Tạo tài khoản" rồi bấm "Gửi lại link" mà cả hai cùng bay thì BE nhận hai
    // lệnh trong khi người dùng chỉ nghĩ mình bấm một lần.
    const fetchMock = stubFetchHangs();
    const runner = createAuthRunner();
    const { effects } = harness();

    const first = runner.run(SIGNUP, effects);
    await runner.run(RESEND, effects);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(authEndpoint('signup'));

    await jumpToTimeout();
    await first;
  });

  it('sau khi xong xuôi thì bấm lại được, chỗ đang chờ phải được nhả ra', async () => {
    stubFetchHangs();
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    const first = runner.run(SIGNIN, effects);
    await jumpToTimeout();
    await first;
    expect(seen.pending[seen.pending.length - 1]).toBeNull();

    const second = runner.run(SIGNIN, effects);
    expect(seen.pending[seen.pending.length - 1]).toEqual({ action: 'submit', mode: 'signin' });
    await jumpToTimeout();
    await second;
  });
});

describe('hết giờ — dừng được và báo rõ', () => {
  it('server im lặng quá hạn thì báo lỗi, tắt trạng thái chờ, và bấm lại được', async () => {
    const fetchMock = stubFetchHangs();
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    const first = runner.run(SIGNIN, effects);
    await jumpToTimeout();
    await first;

    expect(lastError(seen)).toBe(authTimeoutMessage('signin'));
    expect(seen.pending[seen.pending.length - 1]).toBeNull();
    // Không được có "đã xong" khi thật ra chưa ai trả lời.
    expect(seen.done).toEqual([]);

    // Bấm lại được: một lần bấm thất bại không được khoá vĩnh viễn form.
    const second = runner.run(SIGNIN, effects);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await jumpToTimeout();
    await second;
  });

  it('huỷ cả request đang bay, không chỉ ngừng chờ', async () => {
    // Nếu chỉ ngừng chờ thì request vẫn treo trong browser tới khi hết hạn
    // socket, và mỗi lần bấm lại lại thêm một connection treo.
    const fetchMock = stubFetchHangs();
    const runner = createAuthRunner();
    const { effects } = harness();

    const first = runner.run(SIGNIN, effects);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(signal).toBeDefined();
    expect(signal.aborted).toBe(false);

    await jumpToTimeout();
    await first;

    expect(signal.aborted).toBe(true);
  });

  it('đưa signal xuống fetch, không chỉ tạo ra rồi quên', () => {
    // `signal` không truyền vào `fetch` thì `createDeadline` chỉ là đồ trang trí:
    // hết giờ vẫn báo lỗi nhưng request vẫn chạy. Test này chặn đúng lỗi đó.
    const fetchMock = stubFetchOk({ message: 'x' });
    const runner = createAuthRunner();
    const { effects } = harness();

    void runner.run(SIGNIN, effects);

    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('chưa tới hạn thì chưa báo lỗi, kể cả khi đã gần chạm ngưỡng', async () => {
    stubFetchHangs();
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    const first = runner.run(SIGNIN, effects);
    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS - 1);

    expect(lastError(seen)).toBe('');
    expect(seen.pending[seen.pending.length - 1]).toEqual({ action: 'submit', mode: 'signin' });

    await jumpToTimeout();
    await first;
  });

  it('cho phép đặt hạn khác khi cần, mặc định vẫn là hằng', async () => {
    const fetchMock = stubFetchHangs();
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    const quick = runner.run({ ...SIGNIN, timeoutMs: 5_000 }, effects);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(lastError(seen)).toBe('');

    await vi.advanceTimersByTimeAsync(1);
    await quick;
    expect(lastError(seen)).toBe(authTimeoutMessage('signin'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('hết giờ — không rò timer', () => {
  it('request xong thì huỷ hẹn giờ, không để lửng lơ sau khi đã sang trang', async () => {
    // Timer sót lại không chỉ tốn công: nó còn huỷ `signal` ở lượt sau. Ở đây ta
    // kiểm bằng cách cho đồng hồ chạy vượt hạn rồi hỏi xem có gì bị đổi không.
    stubFetchOk({ user: {}, expiresIn: 900 });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    await runner.run(SIGNIN, effects);

    expect(vi.getTimerCount()).toBe(0);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS * 5);

    expect(signal.aborted).toBe(false);
    // `setError("")` lúc bấm là xoá lỗi cũ, không phải lỗi; lọc nó ra rồi đòi
    // là không còn câu báo nào cả.
    expect(seen.errors.filter((m) => m !== '')).toEqual([]);
    expect(seen.done).toEqual(['signedin']);
  });
});

describe('thành công — thoát trạng thái chờ và đi tiếp đúng chỗ', () => {
  it('đăng nhập xong thì đọc lại phiên TRƯỚC rồi mới báo đã vào', async () => {
    // Thứ tự này là cả một lỗi thật đã từng xảy ra: `setDone("signedin")` trước
    // khi `refresh()` kịp trả thì trang chủ dựng lên với `user = null` và đá
    // người dùng về `/sign-in` — tức đăng nhập xong thì bị đuổi.
    stubFetchOk({ user: {}, expiresIn: 900 });
    const runner = createAuthRunner();
    const { seen, effects, calls } = harness();

    await runner.run(SIGNIN, effects);

    expect(calls.indexOf('refresh')).toBeLessThan(calls.indexOf('done:signedin'));
    expect(seen.refreshes).toBe(1);
    expect(seen.done).toEqual(['signedin']);
    expect(seen.pending[seen.pending.length - 1]).toBeNull();
  });

  it('đăng ký xong thì sang màn kiểm tra hộp thư, KHÔNG đọc lại phiên', async () => {
    // `/register` trả 200 mà không đặt cookie phiên. Gọi `refresh()` ở đây đọc
    // `/me` ra `null` và bỏ người dùng ở trang trắng không có dòng giải thích nào.
    stubFetchOk({ message: 'Đã gửi link xác nhận, vui lòng kiểm tra hộp thư.' });
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    await runner.run(SIGNUP, effects);

    expect(seen.refreshes).toBe(0);
    expect(seen.done).toEqual(['sent']);
    expect(seen.pending[seen.pending.length - 1]).toBeNull();
  });

  it('gửi lại link xong thì hiện lời xác nhận, không đổi màn', async () => {
    const RESEND_CAU = 'Nếu email đó có tài khoản chưa xác minh, chúng tôi đã gửi lại link xác nhận.';
    stubFetchOk({ message: RESEND_CAU });
    const runner = createAuthRunner();
    const { seen, effects } = harness();

    await runner.run(RESEND, effects);

    // `setNotice("")` lúc bấm là xoá lời cũ; câu mới là cái cuối cùng.
    expect(seen.notices[seen.notices.length - 1]).toBe(RESEND_CAU);
    expect(seen.done).toEqual([]);
    expect(seen.pending[seen.pending.length - 1]).toBeNull();
  });
});

describe('ba loại lỗi phải là ba câu khác nhau', () => {
  /** Chạy trọn một lần bấm rồi trả về câu lỗi cuối cùng hiện ra. */
  async function errorShownBy(req: typeof SIGNIN): Promise<string> {
    const runner = createAuthRunner();
    const { seen, effects } = harness();
    const running = runner.run(req, effects);
    await jumpToTimeout();
    await running;
    return lastError(seen);
  }

  it('lỗi chủ đích nói về thông tin sai, không nói về mạng', async () => {
    stubFetchNestError(401, 'Email hoặc mật khẩu không đúng');
    const message = await errorShownBy(SIGNIN);

    expect(message).toContain('không đúng');
    // Nói "không kết nối được" cho một lỗi mật khẩu sai là đẩy người dùng
    // đi kiểm tra wifi thay vì kiểm tra lại mật khẩu.
    expect(message).not.toContain('kết nối');
  });

  it('lỗi mạng nói rõ là không kết nối được, không nói thông tin sai', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const message = await errorShownBy(SIGNIN);

    expect(message).toContain('kết nối');
    expect(message).not.toContain('không đúng');
  });

  it('hết giờ nói là chờ quá lâu, không giống lỗi mạng lẫn lỗi thông tin', async () => {
    stubFetchHangs();
    const runner = createAuthRunner();
    const { seen, effects } = harness();
    const running = runner.run(SIGNIN, effects);
    await jumpToTimeout();
    await running;
    const timedOut = lastError(seen);

    expect(timedOut).toBe(authTimeoutMessage('signin'));
    expect(timedOut).not.toContain('không đúng');
    expect(timedOut).toBeTruthy();
  });

  it('ba câu đó thật sự khác nhau, không phải ba bản của một câu', async () => {
    stubFetchNestError(401, 'Email hoặc mật khẩu không đúng');
    const credentials = await errorShownBy(SIGNIN);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const network = await errorShownBy(SIGNIN);

    stubFetchHangs();
    const runner = createAuthRunner();
    const { seen, effects } = harness();
    const running = runner.run(SIGNIN, effects);
    await jumpToTimeout();
    await running;
    const timedOut = lastError(seen);

    expect(new Set([credentials, network, timedOut]).size).toBe(3);
  });

  it('mọi câu lỗi đều nêu cách khắc phục, và cho phép thử lại', async () => {
    // craft-floor: "errors name the problem and the recovery". Hết giờ mà không
    // nói bấm lại được thì người dùng không biết form đã sẵn sàng hay chưa.
    for (const message of [authTimeoutMessage('signin'), UNEXPECTED_MESSAGE]) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).toMatch(/[.!?]/);
      expect(message).toMatch(/thử lại|bấm lại|kiểm tra mạng/i);
    }
  });
});

describe('lỗi không dự đoán được thì không bị nuốt', () => {
  it('lỗi ném ra ngoài vẫn hiện câu riêng và được ghi ra console', async () => {
    // Cùng nguyên tắc đã áp cho mail ở `1fafdaa`: câu cho người dùng không chứa
    // chi tiết kỹ thuật, nhưng lỗi gốc **phải** còn đủ để chẩn đoán. Nuốt trắng
    // thì lúc điện thoại có mạng yếu, chẳng ai biết vì sao form hỏng.
    //
    // Đường này lấy từ `refresh()` vì `submitCredentials` tự bắt lỗi mạng rồi —
    // đó là chỗ hợp lệ duy nhất còn lỗi có thể thoát ra tới `catch` này.
    const boom = new Error('refresh blew up');
    stubFetchOk({ user: {}, expiresIn: 900 });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runner = createAuthRunner();
    const { seen, effects } = harness({
      refresh: async () => {
        throw boom;
      },
    });

    await runner.run(SIGNIN, effects);

    expect(lastError(seen)).toBe(UNEXPECTED_MESSAGE);
    expect(logged).toHaveBeenCalled();
    // Vẫn phải nhả trạng thái chờ, nếu không form kẹt ở "đang đăng nhập" mãi.
    expect(seen.pending[seen.pending.length - 1]).toBeNull();
    expect(seen.done).toEqual([]);

    logged.mockRestore();
  });
});

describe('gọi đúng endpoint, không phụ thuộc .env của máy', () => {
  it('đăng nhập và đăng ký gọi đúng URL dựng từ API_URL của môi trường', async () => {
    // `API_URL` đọc `process.env.NEXT_PUBLIC_API_URL` **lúc nạp module**, nên
    // test gõ cứng `http://localhost:4000` sẽ đỏ trên máy có `.env` khác. So với
    // chính hằng dựng URL thì test đúng ở mọi máy.
    expect(API_URL).toBe(authEndpoint('signin').replace('/api/auth/login', ''));
  });

  it('bấm đăng nhập thì gọi /login, bấm đăng ký thì gọi /register', async () => {
    const signin = stubFetchOk({ user: {}, expiresIn: 900 });
    await createAuthRunner().run(SIGNIN, harness().effects);
    expect(signin.mock.calls[0][0]).toBe(authEndpoint('signin'));

    const signup = stubFetchOk({ message: 'x' });
    await createAuthRunner().run(SIGNUP, harness().effects);
    expect(signup.mock.calls[0][0]).toBe(authEndpoint('signup'));
  });

  it('gửi lại link gọi route riêng, không gọi lại /register', async () => {
    // Gọi lại `/register` là nút chết: tài khoản vừa đăng ký chắc chắn đã tồn
    // tại, nên route đó trả 409 và **không gửi mail**.
    const fetchMock = stubFetchOk({ message: 'x' });
    await createAuthRunner().run(RESEND, harness().effects);

    expect(fetchMock.mock.calls[0][0]).toBe(RESEND_URL);
    expect(fetchMock.mock.calls[0][0]).not.toContain('/register');
  });
});
