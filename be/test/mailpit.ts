/**
 * Client tối thiểu cho Mailpit (SMTP catcher) trong integration test.
 *
 * Mailpit chạy ở đâu do env quyết: `MAILPIT_URL` (mặc định
 * `http://localhost:8025`). SMTP thì BE trỏ qua `SMTP_HOST`/`SMTP_PORT`
 * (xem `AuthMailer`); còn đọc mail đã "gửi" thì qua HTTP API ở đây.
 *
 * Fail closed: Mailpit không reachable là helper ném ngay với câu hướng dẫn
 * `docker run`, chứ không trả mảng rỗng (mảng rỗng làm test "không gửi mail"
 * xanh giả).
 */

export type MailpitMessage = {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
};

function baseUrl(): string {
  return (process.env.MAILPIT_URL ?? 'http://localhost:8025').replace(/\/$/, '');
}

async function api(path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(
      `Không nối được Mailpit ở ${baseUrl()}. Khởi động nó trước:\n` +
        '  docker run -d --name gocode-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit',
    );
  }
  if (!res.ok) throw new Error(`Mailpit API ${path} trả ${res.status}`);
  return res;
}

/** Mailpit sẵn sàng nhận SMTP chưa (dùng trong `beforeAll`). */
export async function mailpitReady(): Promise<void> {
  await api('/api/v1/messages?limit=1');
}

/** Xoá sạch hộp thư — gọi trong `beforeEach` để test độc lập. */
export async function mailpitClear(): Promise<void> {
  await api('/api/v1/messages', { method: 'DELETE' });
}

async function messageDetail(id: string): Promise<{ text: string }> {
  const res = await api(`/api/v1/message/${encodeURIComponent(id)}`);
  const body = (await res.json()) as { Text?: string };
  return { text: body.Text ?? '' };
}

function addrOf(a: unknown): string {
  if (typeof a === 'string') return a;
  const o = a as { Address?: unknown };
  return typeof o.Address === 'string' ? o.Address : '';
}

/** Mọi mail hiện trong hộp thư, kèm nội dung text. */
export async function mailpitMessages(): Promise<MailpitMessage[]> {
  const res = await api('/api/v1/messages?limit=200');
  const body = (await res.json()) as {
    messages?: Array<{ ID: string; Subject?: string; From?: unknown; To?: unknown[] }>;
  };
  const out: MailpitMessage[] = [];
  for (const m of body.messages ?? []) {
    const { text } = await messageDetail(m.ID);
    out.push({
      id: m.ID,
      from: addrOf(m.From),
      to: (m.To ?? []).map(addrOf),
      subject: m.Subject ?? '',
      text,
    });
  }
  return out;
}

/** Mail gửi tới đúng địa chỉ (so không phân biệt hoa thường). */
export async function mailpitTo(email: string): Promise<MailpitMessage[]> {
  const want = email.trim().toLowerCase();
  return (await mailpitMessages()).filter((m) => m.to.some((t) => t.toLowerCase() === want));
}

/**
 * Chờ điều kiện đúng (poll), thay vì `sleep` đoán mò: SMTP nền của
 * `resendVerification` (fire-and-forget) không có mốc xong để await.
 * Hết giờ mà chưa đúng thì ném kèm nội dung đang có để dễ đọc log.
 */
export async function mailpitWaitFor(
  cond: (msgs: MailpitMessage[]) => boolean,
  opts: { timeoutMs?: number; stepMs?: number; moTa?: string } = {},
): Promise<MailpitMessage[]> {
  const { timeoutMs = 15_000, stepMs = 250, moTa = 'điều kiện' } = opts;
  const start = Date.now();
  let last: MailpitMessage[] = [];
  for (;;) {
    last = await mailpitMessages();
    if (cond(last)) return last;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Chờ Mailpit quá ${timeoutMs}ms mà chưa: ${moTa} (đang có ${last.length} mail)`,
      );
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
