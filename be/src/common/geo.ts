// GeoIP nhẹ dùng chung: ưu tiên header Vercel (miễn phí, chính xác),
// fallback ip-api cho IP public. Không bao giờ throw.
export function isPublicIp(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 0 || a >= 224) return false;
    return true;
  }
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return false;
  return ip.includes(':');
}

export function clientIp(
  headers: Record<string, string | string[] | undefined> | undefined,
  fallbackIp?: string,
): string {
  const forwarded = headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
  return first || fallbackIp || 'unknown';
}

export function headerCountry(
  headers: Record<string, string | string[] | undefined> | undefined,
): string {
  const raw = headers?.['x-vercel-ip-country'];
  const code = Array.isArray(raw) ? raw[0] : raw;
  return (code ?? '').toUpperCase().slice(0, 2);
}

export async function lookupCountry(ip: string): Promise<string> {
  if (!isPublicIp(ip)) return '';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`,
      { signal: ctrl.signal },
    );
    clearTimeout(timer);
    const data = (await res.json().catch(() => null)) as {
      status?: string;
      countryCode?: string;
    } | null;
    if (data?.status === 'success' && data.countryCode) {
      return data.countryCode.toUpperCase().slice(0, 2);
    }
  } catch {
    // tra cứu lỗi thì để trống
  }
  return '';
}
