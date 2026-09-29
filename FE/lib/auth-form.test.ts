import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_PASSWORD_LENGTH,
  OAUTH_MESSAGES,
  VERIFY_LINK_HOURS,
  authEndpoint,
  authErrorMessage,
  googleStartUrl,
  normalizeEmail,
  oauthMessage,
  resendVerification,
  safeRedirect,
  submitCredentials,
  verifyEmailToken,
} from './auth-form';
import { API_URL } from './swr';

/** Nguyên văn `RESEND_SENT` ở `be/src/auth/auth.service.ts` — hợp đồng, không phải chi tiết. */
const RESEND_CAU = 'Nếu email đó có tài khoản chưa xác minh, chúng tôi đã gửi lại link xác nhận.';

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

describe('resendVerification — nút "Gửi lại link"', () => {
  it('gọi đúng endpoint, chuẩn hoá email, đi kèm cookie, không gắn Authorization', async () => {
    const f = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ message: 'x' }) });
    await resendVerification('  A@B.co  ');

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/api/auth/resend-verification`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@b.co' });
    expect(init.credentials).toBe('include');
    // Token nằm trong cookie httpOnly — gắn header tay là đọc trộm cookie.
    expect(sentHeaders(init)).toEqual({ 'Content-Type': 'application/json' });
  });

  /**
   * Hàng rào cho lỗi khiến nút này chết ngay từ đầu: gọi lại `/register` thì
   * **luôn** 409 vì tài khoản vừa đăng ký chắc chắn đã tồn tại. Route này phải là
   * `resend-verification` và phải trả 200.
   */
  it('không gọi lại /register — đó là nút chết vì 409', async () => {
    const f = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ message: 'x' }) });
    await resendVerification('a@b.co');
    const [url] = f.mock.calls[0] as [string];
    expect(url).not.toContain('/register');
  });

  it('200 thì trả nguyên câu của BE', async () => {
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ message: RESEND_CAU }) });
    expect(await resendVerification('a@b.co')).toEqual({ kind: 'ok', message: RESEND_CAU });
  });

  it('BE không trả message thì dùng câu hợp đồng, không phải câu suông', async () => {
    // Sửa câu dự phòng lệch khỏi câu của BE là biến màn này thành công cụ dò
    // email: người dùng đọc câu lệch đó sẽ tưởng mình có (hoặc không có) tài khoản.
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({}) });
    expect(await resendVerification('a@b.co')).toEqual({ kind: 'ok', message: RESEND_CAU });
  });

  it('429 thì báo phải chờ, không báo "đã gửi"', async () => {
    const r = await (async () => {
      stubFetch(nestError(429, 'Quá nhiều yêu cầu, vui lòng thử lại sau'));
      return resendVerification('a@b.co');
    })();
    expect(r.kind).toBe('error');
    expect((r as { message: string }).message).toContain('Chờ một lúc');
  });

  it('lỗi mạng (fetch ném) thành câu có cả vấn đề lẫn cách khắc phục', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await resendVerification('a@b.co')).toEqual({
      kind: 'error',
      message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
    });
  });

  it('body hỏng (json() ném) ở 200 vẫn ra câu hợp đồng, không sập', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    expect(await resendVerification('a@b.co')).toEqual({ kind: 'ok', message: RESEND_CAU });
  });
});
describe('verifyEmailToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('goi GET /api/auth/verify voi token encode, kem credentials include', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ user: { id: 1 } }),
    });

    const r = await verifyEmailToken('ma co khoang trang & ky tu dac biet');

    expect(r).toEqual({ kind: 'ok' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      API_URL + '/api/auth/verify?token=ma%20co%20khoang%20trang%20%26%20ky%20tu%20dac%20biet',
    );
    expect(init.method).toBe('GET');
    // Cookie phiên do BE set trong chính response nay; thieu `include` thi
    // trinh duyet bo cookie va nguoi dung thay nhu khong co gi xay ra.
    expect(init.credentials).toBe('include');
  });

  it('token rong thi khong goi mang, bao loi ro rang', async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: () => Promise.resolve({}) });

    const r = await verifyEmailToken('');

    expect(r.kind).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mang chet ra loi "khong ket noi duoc", khong phai "ma het han"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const r = await verifyEmailToken('ma-hieu-luc');

    expect(r.kind).toBe('error');
    // Bao nham kiem tra lai email se day nguoi dung vao vong vo.
    expect((r as { message: string }).message).toMatch(/mạng|ket noi/i);
    expect((r as { message: string }).message).not.toMatch(/hết hạn|hạn/i);
  });

  it('BE tra 400 thi dung nguyen cau cua BE', async () => {
    stubFetch({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'Mã xác nhận không hợp lệ hoặc đã hết hạn' }),
    });

    const r = await verifyEmailToken('ma-het-han');

    expect(r).toEqual({ kind: 'error', message: 'Mã xác nhận không hợp lệ hoặc đã hết hạn' });
  });

  it('body 200 hong van la xac nhan thanh cong, khong bao loi', async () => {
    stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });

    const r = await verifyEmailToken('ma');

    expect(r).toEqual({ kind: 'ok' });
  });
});
describe('safeRedirect', () => {
  it('chấp nhận đường dẫn nội bộ', () => {
    expect(safeRedirect('/problem/two-sum')).toBe('/problem/two-sum');
    expect(safeRedirect('/premium')).toBe('/premium');
    expect(safeRedirect('  /problem  ')).toBe('/problem');
  });

  it('chặn URL tuyệt đối — đây là open redirect', () => {
    expect(safeRedirect('https://evil.com')).toBe('/');
    expect(safeRedirect('http://evil.com')).toBe('/');
    expect(safeRedirect('javascript:alert(1)')).toBe('/');
    expect(safeRedirect('data:text/html,<script>')).toBe('/');
  });

  it('chặn protocol-relative vì trình duyệt coi //evil.com là domain khác', () => {
    expect(safeRedirect('//evil.com')).toBe('/');
    expect(safeRedirect('/\\evil.com')).toBe('/');
  });

  it('rỗng / không phải chuỗi thì dùng fallback', () => {
    expect(safeRedirect('')).toBe('/');
    expect(safeRedirect('   ')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(['/a', '/b'])).toBe('/');
    expect(safeRedirect(42)).toBe('/');
  });

  it('tôn trọng fallback do nơi gọi truyền vào', () => {
    expect(safeRedirect('https://evil.com', '/problem')).toBe('/problem');
    expect(safeRedirect(undefined, '/problem')).toBe('/problem');
  });
});

describe('googleStartUrl', () => {
  it('trỏ thẳng route start của BE, mang redirect_to đã an toàn', () => {
    expect(googleStartUrl('/problem/two-sum')).toBe(
      API_URL + '/api/auth/oauth/google/start?redirect_to=' + encodeURIComponent('/problem/two-sum'),
    );
  });

  it('redirect_to ngoài nội bộ bị thay bằng trang chủ TRƯỚC khi gửi lên BE', () => {
    // Hai đầu đều phải kiểm: `auth.controller.ts:339` có `safeInternalPath`
    // nhưng `beginGoogleOAuth` ghi giá trị vào DB rồi callback đọc lại từ đó,
    // nên nếu chỉ một đầu kiểm thì đường ngoài nội bộ vẫn đi lọt.
    expect(googleStartUrl('https://evil.com')).toContain('redirect_to=' + encodeURIComponent('/'));
    expect(googleStartUrl('//evil.com')).not.toContain('evil.com');
    expect(googleStartUrl('//evil.com')).toContain('redirect_to=' + encodeURIComponent('/'));
  });

  it('encode đủ, để dấu & hay ? trong đường dẫn không lọt thành tham số khác', () => {
    // `redirect_to` là tham số cuối của URL. Nếu không encode, link này
    // `?a=1&state=spoofed` sẽ sinh ra tham số `state` do kẻ xấu chọn.
    const url = googleStartUrl('/problem?a=1&b=2#x');
    expect(url).toContain('redirect_to=' + encodeURIComponent('/problem?a=1&b=2#x'));
    expect(url.split('redirect_to=')[1]).not.toContain('&');
  });
});

describe('OAUTH_MESSAGES', () => {
  /**
   * Sáu mã, không phải năm. Brief Task 5 chỉ liệt kê năm và bỏ sót
   * `conflict` — nhưng `auth.controller.ts:389` **có** trả mã đó, nên bỏ sót
   * thì người gặp xung đột tài khoản quay lại `/sign-in` và thấy… không
   * có gì cả: form im lặng y như mình chưa từng bấm Google.
   */
  const ALL_CODES = ['cancelled', 'expired', 'exists', 'failed', 'unverified', 'conflict'] as const;

  it('có câu cho MỌI mã BE trả về qua ?oauth=', () => {
    for (const k of ALL_CODES) {
      expect(typeof OAUTH_MESSAGES[k]).toBe('string');
      expect(OAUTH_MESSAGES[k].length).toBeGreaterThan(10);
    }
  });

  it('đúng sáu mã, không thừa không thiếu', () => {
    // Mã thừa là câu chết không ai đọc tới; mã thiếu là im lặng. Hai lỗi ngược
    // nhau nên phải canh bằng cách so sánh cả hai chiều.
    expect(Object.keys(OAUTH_MESSAGES).sort()).toEqual([...ALL_CODES].sort());
  });

  it('mỗi câu đều là câu trọn vẹn, không phải mã lỗi lộ ra màn hình', () => {
    for (const k of ALL_CODES) {
      expect(OAUTH_MESSAGES[k]).toMatch(/[.!?]/);
      expect(OAUTH_MESSAGES[k]).not.toContain('undefined');
    }
  });

  it('`exists` chỉ đúng việc phải làm: đăng nhập bằng mật khẩu trước', () => {
    // Câu quan trọng nhất. Không nói "đăng nhập bằng mật khẩu trước" thì
    // người dùng bấm Google lại mãi và không bao giờ đổi cách.
    expect(OAUTH_MESSAGES.exists).toContain('Đăng nhập bằng mật khẩu trước');
  });

  it('`conflict` nói rõ đây KHÔNG phải lỗi của họ, và chỉ ra việc phải làm', () => {
    // Xung đột tài khoản là lỗi phía hệ thống/ghép tài khoản, không phải
    // người dùng làm hỏng gì. Câu không nói rõ điều đó thì họ sẽ đi tìm
    // lỗi ở phía mình.
    expect(OAUTH_MESSAGES.conflict).toContain('không phải lỗi của bạn');
    // Bước tiếp theo phải là **đăng xuất**. `auth.service.ts:667,678` chỉ
    // trả `conflict` khi người dùng ĐANG đăng nhập — bấm lại Google mà vẫn
    // giữ phiên đó thì BE trả đúng mã này lần nữa, vòng lặp vô tận.
    expect(OAUTH_MESSAGES.conflict).toContain('đăng xuất');
    // Vì vậy câu tuyệt đối không được bảo họ "thử lại".
    expect(OAUTH_MESSAGES.conflict).not.toMatch(/thử lại/i);
  });
});

describe('oauthMessage — đọc ?oauth= từ URL', () => {
  it('mã biết thì ra đúng câu', () => {
    expect(oauthMessage('exists')).toBe(OAUTH_MESSAGES.exists);
    expect(oauthMessage('conflict')).toBe(OAUTH_MESSAGES.conflict);
  });

  it('mã lạ thì KHÔNG hiện gì, chứ không in `undefined` lên màn hình', () => {
    // `?oauth=` là do người dùng gõ tay được, và BE có thể thêm mã mới ở bản
    // sau. Tra thẳng `OAUTH_MESSAGES[x]` cho `undefined`, mà render `{undefined}`
    // vào JSX thì React hiện chữ "undefined" — tệ hơn là im lặng.
    expect(oauthMessage('ma-moi-tu-be')).toBeNull();
    expect(oauthMessage('')).toBeNull();
    expect(oauthMessage(undefined)).toBeNull();
    expect(oauthMessage(null)).toBeNull();
  });

  it('sai kiểu thì không ném, vì searchParams của Next 16 có thể là mảng', () => {
    // `?oauth=a&oauth=b` thành mảng. Không có `typeof` check thì `.toLowerCase`
    // ném và cả trang 500.
    expect(oauthMessage(['exists', 'failed'])).toBeNull();
    expect(oauthMessage(42)).toBeNull();
    expect(oauthMessage({ toString: () => 'exists' })).toBeNull();
  });
});

