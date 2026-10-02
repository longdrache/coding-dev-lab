// Gọi API cùng domain qua BFF proxy (app/api/[...path]) để cookie
// admin_token thuộc domain admin. Không gọi thẳng BE cross-site nữa.

/** Route làm mới của admin. Không có `AdminGuard` — nó chạy lúc token đã hết hạn. */
export const ADMIN_REFRESH_PATH = "/api/admin/refresh";
export const ADMIN_SIGN_IN_PATH = "/sign-in";

/**
 * `401` là hết phiên; **mọi** status khác — kể cả `5xx` — là lỗi tạm.
 *
 * Ranh giới này quan trọng vì app admin trước đây có **không** đường làm mới
 * nào: access token sống 30 phút (`ADMIN_ACCESS_TTL`) và hết hạn thì mọi request
 * 401. Giờ đã có `refreshAdminSessionOnce`, nhưng nó chỉ chạy khi đúng `401` —
 * coi `503` là hết phiên là đá người đang dùng vì BE chập chờn nửa giây.
 */
export function isSessionOver(status: number): boolean {
  return status === 401;
}

/**
 * Một lần làm mới cho **mọi** nơi đang chờ.
 *
 * Một màn admin bắn nhiều `useSWR` cùng lúc (dashboard: stats, views, logins,
 * QnA, submissions) nên khi access token vừa hết hạn, **tất cả** key đều 401
 * cùng một nhịp. Không dedupe thì mỗi key một lần gọi `/refresh` — mười lần
 * trong một nhịp, mỗi lần lại ghi cookie, và các lượt sau phải tranh nhau token.
 * Một lần là đủ và là đúng.
 */
let inflight: Promise<boolean> | null = null;

export function refreshAdminSessionOnce(): Promise<boolean> {
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch(ADMIN_REFRESH_PATH, {
          method: "POST",
          credentials: "include",
        });
        return res.ok;
      } catch {
        // Lỗi mạng: KHÔNG coi là hết phiên. Phiên có thể còn; chỉ là chưa làm
        // mới được lần này.
        return false;
      }
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/**
 * Response giả cho lỗi mạng.
 *
 * **Không** đặt `statusText` tiếng Việt: `statusText` phải là ByteString (Latin-1)
 * nên `new Response(..., { statusText: "Không kết nối..." })` ném
 * `TypeError: Cannot convert argument to a ByteString` — tức chính đường xử lý
 * lỗi mạng lại chết vì lý do là có tiếng Việt trong nó.
 */
function offlineResponse(): Response {
  return new Response(null, { status: 502 });
}

/**
 * Gửi request tới admin API, tự làm mới **một lần** khi access token hết hạn.
 *
 * - `401` lần đầu → thử `/refresh` rồi gửi lại **đúng một lần**.
 * - Sau lần gửi lại vẫn `401`, hoặc refresh không được → phiên **thật sự** kết
 *   thúc: đưa người dùng về `/sign-in`.
 * - `5xx` / lỗi mạng → trả nguyên response cho chỗ gọi tự hiện lỗi. Tuyệt đối
 *   không điều hướng và không coi là hết phiên.
 *
 * `typeof window !== 'undefined'` vì file này cũng bị import ở server component:
 * không có `window` thì bỏ qua điều hướng, màn hình sẽ hiện lỗi 401 như cũ.
 */
export async function adminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const send = () =>
    fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

  let res: Response;
  try {
    res = await send();
  } catch {
    // `fetch` ném = mạng chết / CORS. Trả 502 để chỗ gọi có cái gì đó bắt, thay vì
    // `undefined` làm vỡ `res.ok` của caller.
    return offlineResponse();
  }

  // Chính route làm mới không được tự gọi lại chính nó.
  if (!isSessionOver(res.status) || path === ADMIN_REFRESH_PATH) return res;

  if (await refreshAdminSessionOnce()) {
    try {
      res = await send();
    } catch {
      return offlineResponse();
    }
    if (!isSessionOver(res.status)) return res;
  }

  // Tới đây là hết phiên thật (hết 7 ngày, hoặc refresh bị từ chối).
  //
  // `replace` chứ không phải `push`/`assign`: trang đang mở là trang chết, để nó
  // trong lịch sử là bấm "quay lại" thì lại quay về trang chết. `lib/api.ts` là
  // nơi **duy nhất** biết phiên đã hết — không có provider ở app admin nên không
  // có chỗ nào khác để bắt, và để mỗi trang tự xử lý là chỗ nào cũng quên.
  if (typeof window !== "undefined") window.location.replace(ADMIN_SIGN_IN_PATH);
  return res;
}