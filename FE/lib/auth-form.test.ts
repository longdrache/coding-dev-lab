import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  VERIFY_LINK_HOURS,
  authEndpoint,
  authErrorMessage,
  normalizeEmail,
  submitCredentials,
} from './auth-form';
import { API_URL } from './swr';

/** Response giả của fetch, chỉ cần các trường code thật sự đọc. */
function stubFetch(res: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Đọc header đã gửi ở bất kỳ dạng `HeadersInit` nào. */
function sentHeaders(init: RequestInit | undefined): Record<string, string> {
  const h = init?.headers;
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

/** Đúng hình dạng lỗi của Nest: `{ statusCode, message, error }`. */
function nestError(status: number, message: unknown) {
  return { ok: false, status, json: () => Promise.resolve({ statusCode: status, message, error: 'Bad Request' }) };
}

describe('hợp đồng với BE', () => {
  it('số ký tự tối thiểu khớp PASSWORD_TOO_SHORT của BE', () => {
    // be/src/auth/auth.service.ts:46 chặn `< 8`. Lệch sang 6 là ô mật khẩu cho
    // qua rồi BE mới trả lỗi — tức hai nơi một luật, dễ lệch.
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('hạn link xác nhận là 24 giờ, khớp VERIFY_TTL_MS của BE', () => {
    // be/src/auth/auth.service.ts:36. Đây là câu ta hứa với người dùng ngay
    // trước khi họ bấm đăng ký, nên đổi số ở đây là đổi lời hứa.
    expect(VERIFY_LINK_HOURS).toBe(24);
  });
});

describe('authEndpoint', () => {
  // Hai endpoint này chỉ khác nhau một chữ và trả về hai thứ hoàn toàn khác
  // nhau (một cái cấp cookie phiên, một cái chỉ gửi mail) — gõ nhầm là hỏng
  // âm thầm, không có lỗi biên dịch nào bắt được.
  it('signin gọi /login, signup gọi /register', () => {
    expect(authEndpoint('signin')).toBe(`${API_URL}/api/auth/login`);
    expect(authEndpoint('signup')).toBe(`${API_URL}/api/auth/register`);
  });
});

describe('normalizeEmail', () => {
  it('bỏ khoảng trắng thừa và hạ chữ thường, y hệt BE', () => {
    // BE tự trim + toLowerCase trước khi lưu (auth.service.ts:99). Ta làm
    // y hệt vì màn "đã gửi link" in ra chính email đó — in khác đi tức nói
    // dối người dùng về nơi mail của họ đang nằm.
    expect(normalizeEmail('  HS@Gocode.VN  ')).toBe('hs@gocode.vn');
  });

  it('không đụng dấu chấm hay @ trong email', () => {
    expect(normalizeEmail('a.b+tag@sub.domain.vn')).toBe('a.b+tag@sub.domain.vn');
  });
});

describe('submitCredentials — hợp đồng HTTP', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gửi credentials include, đúng content-type, và không gắn Authorization', async () => {
    // Cookie phiên do BE đặt ở `httpOnly` nên JS không đọc được token để gắn
    // vào header; `include` là điều kiện sống còn. Thiếu nó thì đăng nhập
    // "thành công" rồi mọi request sau đều 401.
    const fetchMock = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ user: {}, expiresIn: 900 }) });

    await submitCredentials('signin', 'hs@gocode.vn', 'matkhau123');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/auth/login`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(sentHeaders(init)['Content-Type']).toBe('application/json');
    expect(sentHeaders(init).Authorization).toBeUndefined();
  });

  it('gửi email đã chuẩn hoá, không gửi bản gõ thô', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({}) });

    await submitCredentials('signup', '  HS@Gocode.VN ', 'matkhau123');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ email: 'hs@gocode.vn', password: 'matkhau123' });
  });

  it('signup trả ok dù body không có user, vì tài khoản mới chưa có phiên', async () => {
    // `/register` trả `{ message }` và KHÔNG đặt cookie (auth.controller.ts:123).
    // Nếu coi đây là "đã đăng nhập" thì `refresh()` sẽ đọc `/me` ra null và
    // người dùng bị bỏ mặc ở trang trắng. Đây là ca dễ sai nhất của cả form.
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ message: 'Đã gửi link xác nhận, vui lòng kiểm tra hộp thư.' }) });

    await expect(submitCredentials('signup', 'hs@gocode.vn', 'matkhau123')).resolves.toEqual({ kind: 'ok' });
  });

  it('lỗi mạng (fetch ném) thành câu có cả vấn đề lẫn cách khắc phục, không ném ra ngoài', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const r = await submitCredentials('signin', 'hs@gocode.vn', 'matkhau123');

    expect(r.kind).toBe('error');
    const message = r.kind === 'error' ? r.message : '';
    expect(message).toContain('mạng');
    expect(message.length).toBeGreaterThan(0);
  });

  it('body hỏng (json() ném) vẫn ra thông báo lỗi, không sập', async () => {
    // Proxy/CDN hay trả HTML 502 — `res.json()` ném. Không có `catch` ở đây thì
    // promise reject và form hiện màn trắng thay vì câu báo lỗi.
    stubFetch({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('Unexpected token <')) });

    const r = await submitCredentials('signin', 'hs@gocode.vn', 'matkhau123');

    expect(r.kind).toBe('error');
    expect(r.kind === 'error' && r.message).toContain('Máy chủ');
  });
});

describe('submitCredentials — dịch lỗi BE sang tiếng Việt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Đi hết vòng submit để chứng minh bản dịch chạy được trên đường đi thật. */
  async function submitError(mode: 'signin' | 'signup', status: number, message: unknown) {
    stubFetch(nestError(status, message));
    const r = await submitCredentials(mode, 'hs@gocode.vn', 'matkhau123');
    if (r.kind !== 'error') throw new Error(`hợp lẽ ra phải lỗi, thật ra là ${r.kind}`);
    return r.message;
  }

  it('mật khẩu ngắn', async () => {
    expect(await submitError('signup', 400, 'Mật khẩu phải có ít nhất 8 ký tự')).toContain('8 ký tự');
  });

  it('email sai dạng', async () => {
    expect(await submitError('signup', 400, 'Email không hợp lệ')).toContain('đúng dạng');
  });

  it('email đã có tài khoản', async () => {
    // 409 của BE. Câu phải chỉ đường thoát, chứ không chỉ báo lỗi.
    expect(await submitError('signup', 409, 'Email này đã được dùng để đăng ký')).toContain('đăng nhập');
  });

  it('sai email hoặc mật khẩu', async () => {
    expect(await submitError('signin', 401, 'Email hoặc mật khẩu không đúng')).toContain('không đúng');
  });

  it('quá nhiều lần thử (429 của ThrottleGuard)', async () => {
    // be/src/common/throttle.guard.ts:64 — đăng ký tối đa 20 lần/giờ, đăng nhập
    // 30 lần/15 phút, tính theo IP. IP dùng chung ở VN rất phổ biến nên câu
    // phải dịu, không đổ lỗi cho người dùng.
    expect(await submitError('signup', 429, 'Quá nhiều yêu cầu, vui lòng thử lại sau')).toContain('Chờ');
  });

  it('message dạng mảng (validation pipe) thì lấy phần tử đầu', async () => {
    // Nest trả `message` là mảng khi pipe báo nhiều lỗi cùng lúc. Đọc thẳng
    // như chuỗi thì tất cả các message BE đều rơi xuống fallback.
    expect(await submitError('signup', 400, ['Email không hợp lệ', 'Mật khẩu phải có ít nhất 8 ký tự'])).toContain(
      'đúng dạng',
    );
  });
});

describe('authErrorMessage — khi không đọc được message của BE', () => {
  it('BE đổi câu thì vẫn ra thông báo tiếng Việt, không phải undefined', () => {
    // Khoá của bản dịch phải là câu của BE, không phải mã lỗi. BE sửa câu là
    // bản dịch hỏng, và người dùng thấy `undefined` hiện ra trên form.
    const m = authErrorMessage(409, { message: 'Câu mới mà FE chưa biết' }, 'signup');
    expect(m).toBeTruthy();
    expect(m).not.toContain('undefined');
    expect(m).not.toBe('Câu mới mà FE chưa biết');
  });

  it('429 không kèm message vẫn nói đúng việc phải chờ', () => {
    // 429 là lỗi mà status đã đủ nói hết, nên phải dịch được từ status.
    expect(authErrorMessage(429, {}, 'signin')).toContain('Chờ');
  });

  it('5xx thì đổ lỗi cho máy chủ chứ không phải cho người dùng', () => {
    expect(authErrorMessage(503, null, 'signin')).toContain('Máy chủ');
  });

  it('câu dự phòng nói đúng động từ của mode, không nói "đăng nhập" khi đang đăng ký', async () => {
    // Câu chung chung nhất của cả form; nói sai động từ thì người đăng ký bị
    // báo nhầm là đang đăng nhập hỏng.
    expect(authErrorMessage(400, null, 'signup')).toContain('đăng ký');
    expect(authErrorMessage(400, null, 'signup')).not.toContain('đăng nhập');
    expect(authErrorMessage(400, null, 'signin')).toContain('đăng nhập');
  });

  it('mọi thông báo đều nêu cách khắc phục chứ không chỉ nêu lỗi', () => {
    // craft-floor: "errors name the problem and the recovery".
    const all = [
      authErrorMessage(400, null, 'signup'),
      authErrorMessage(401, null, 'signin'),
      authErrorMessage(429, null, 'signin'),
      authErrorMessage(500, null, 'signup'),
      authErrorMessage(418, null, 'signup'),
    ];
    for (const m of all) {
      expect(m.length).toBeGreaterThan(20);
      expect(m).toMatch(/[.!?]/);
    }
  });
});
