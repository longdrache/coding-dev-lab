import { describe, expect, it, vi, afterEach } from 'vitest';
import { isPublicIp, clientIp, headerCountry, lookupCountry } from './geo.ts';

/**
 * GeoIP phục vụ một mục đích hẹp: biết người dùng ở đâu **để đếm hoạt động**, và
 * tuyệt đối không được làm hỏng request. Vì vậy:
 *
 *   - `lookupCountry` không bao giờ ném — lỗi mạng trả `''` chứ không phải 500;
 *   - IP nội bộ (loopback, mạng riêng) không được gọi ra ngoài, vừa nhanh vừa
 *     không rò địa chỉ nội bộ ra dịch vụ bên thứ ba.
 *
 * `x-forwarded-for` là danh sách nối bởi proxy — chỉ phần tử **đầu** là IP người
 * dùng thật; phần tử cuối là proxy của họ.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPublicIp — loại IP nội bộ', () => {
  it('IP công cộng IPv4 thì đúng', () => {
    expect(isPublicIp('203.0.113.7')).toBe(true);
    expect(isPublicIp('8.8.8.8')).toBe(true);
    // 172.15/172.32 nằm ngoài dải private 172.16–172.31
    expect(isPublicIp('172.15.0.1')).toBe(true);
    expect(isPublicIp('172.32.0.1')).toBe(true);
  });

  it('mạng riêng và loopback thì không', () => {
    expect(isPublicIp('10.0.0.1')).toBe(false);
    expect(isPublicIp('127.0.0.1')).toBe(false);
    expect(isPublicIp('192.168.1.1')).toBe(false);
    expect(isPublicIp('172.16.0.1')).toBe(false);
    expect(isPublicIp('172.31.255.255')).toBe(false);
  });

  // 0.0.0.0 (chưa gán) và 224+ (multicast/reserved) không phải địa chỉ nguồn thật.
  it('`0.0.0.0` và dải 224+ không phải IP công cộng dùng được', () => {
    expect(isPublicIp('0.0.0.0')).toBe(false);
    expect(isPublicIp('224.0.0.1')).toBe(false);
    expect(isPublicIp('255.255.255.255')).toBe(false);
  });

  it('IPv6 loopback và IPv4-mapped loopback thì không', () => {
    expect(isPublicIp('::1')).toBe(false);
    expect(isPublicIp('::ffff:127.0.0.1')).toBe(false);
  });

  it('IPv6 công cộng thì đúng', () => {
    expect(isPublicIp('2001:db8::1')).toBe(true);
  });

  it('rỗng hoặc `unknown` thì không — tức không tra cứu gì cả', () => {
    expect(isPublicIp('')).toBe(false);
    expect(isPublicIp('unknown')).toBe(false);
  });
});

describe('clientIp — lấy IP thật của người dùng', () => {
  it('lấy phần tử đầu của `x-forwarded-for`', () => {
    expect(clientIp({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' })).toBe('203.0.113.7');
  });

  it('cắt khoảng trắng quanh IP', () => {
    expect(clientIp({ 'x-forwarded-for': '  203.0.113.7 ,10.0.0.1' })).toBe('203.0.113.7');
  });

  it('header dạng mảng thì lấy phần tử đầu', () => {
    expect(clientIp({ 'x-forwarded-for': ['203.0.113.9', '10.0.0.1'] })).toBe('203.0.113.9');
  });

  it('lùi về `req.ip` khi không có header', () => {
    expect(clientIp({}, '198.51.100.4')).toBe('198.51.100.4');
  });

  it('không có gì cả thì `unknown` chứ không `undefined`', () => {
    expect(clientIp(undefined)).toBe('unknown');
    expect(clientIp({})).toBe('unknown');
    expect(clientIp({ 'x-forwarded-for': '  , 10.0.0.1' }, '198.51.100.4')).toBe(
      '198.51.100.4',
    );
  });
});

describe('headerCountry — quốc gia Vercel gắn sẵn', () => {
  it('đưa lên chữ hoa và cắt còn 2 ký tự', () => {
    expect(headerCountry({ 'x-vercel-ip-country': 'vn' })).toBe('VN');
  });

  it('header dạng mảng thì lấy phần tử đầu', () => {
    expect(headerCountry({ 'x-vercel-ip-country': ['vn', 'us'] })).toBe('VN');
  });

  // Thiếu header là chuyện thường ở local; trả `''` để nơi gọi biết là "chưa biết",
  // khác với trả mã quốc gia sai.
  it('không có header thì chuỗi rỗng', () => {
    expect(headerCountry(undefined)).toBe('');
    expect(headerCountry({})).toBe('');
  });
});

describe('lookupCountry — không bao giờ ném', () => {
  it('IP nội bộ thì không gọi mạng', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await lookupCountry('127.0.0.1')).toBe('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('IP công cộng thì tra và chuẩn hoá mã quốc gia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => ({ status: 'success', countryCode: 'vn' }),
      })),
    );
    expect(await lookupCountry('203.0.113.7')).toBe('VN');
  });

  // ip-api trả `status: 'fail'` khi IP không tra được; đó **không** phải lỗi mạng
  // nhưng cũng không phải quốc gia, nên trả rỗng chứ không ném.
  it('`status` khác `success` thì trả rỗng', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ status: 'fail' }) })),
    );
    expect(await lookupCountry('203.0.113.7')).toBe('');
  });

  it('thiếu `countryCode` thì trả rỗng', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ status: 'success' }) })),
    );
    expect(await lookupCountry('203.0.113.7')).toBe('');
  });

  // `json()` hỏng (HTML từ proxy chặn) không được làm nổ request đếm lượt xem.
  it('phản hồi không phải JSON thì trả rỗng, không ném', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        json: async () => {
          throw new Error('Unexpected token <');
        },
      })),
    );
    expect(await lookupCountry('203.0.113.7')).toBe('');
  });

  // Ràng buộc quan trọng nhất: hết mạng thì trả rỗng, tuyệt đối không ném — nếu
  // ném, mọi lượt xem đều thành 500.
  it('fetch ném lỗi (hết mạng, timeout) thì trả rỗng', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    expect(await lookupCountry('203.0.113.7')).toBe('');
  });
});
