import { NextRequest, NextResponse } from "next/server";

// BFF proxy: admin gọi API cùng domain (/api/...) để cookie admin_token
// thuộc domain admin (cookie do BE set thuộc domain BE, browser không
// gửi sang domain khác). Proxy forward sang BE thật kèm Bearer.
const BE_URL =
  process.env.BE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

const HOP_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "content-encoding",
  "keep-alive",
]);

/**
 * Hạn cookie phải bám hạn thật của JWT bên trong.
 *
 * Trước đây `admin_token` sống 7 ngày trong khi bên trong là JWT 30 phút và
 * không có refresh token nào: nên sau 30 phút làm việc, cookie vẫn còn, mọi
 * request 401, và admin tưởng ứng dụng hỏng. Đặt `admin_refresh` 7 ngày cạnh
 * `admin_token` 30 phút là để sau 30 phút vẫn làm mới được thay vì gõ lại
 * mật khẩu.
 *
 * Số phút/giây phải khớp `ADMIN_ACCESS_TTL`/`ADMIN_REFRESH_TTL` ở
 * `be/src/admin/admin.service.ts`.
 */
const ADMIN_ACCESS_TTL_MS = 30 * 60 * 1000;
const ADMIN_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function adminCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeMs,
    path: "/",
  };
}

function pickHeaders(src: Headers): Headers {
  const headers = new Headers();
  src.forEach((v, k) => {
    if (!HOP_HEADERS.has(k.toLowerCase())) {
      try {
        headers.set(k, v);
      } catch {
        // bỏ qua header không hợp lệ
      }
    }
  });
  return headers;
}

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/api\//, "");
  const url = `${BE_URL.replace(/\/$/, "")}/api/${path}${req.nextUrl.search}`;

  const headers = pickHeaders(req.headers);
  // Cookie admin-domain -> Bearer cho BE (AdminGuard chấp nhận cả hai)
  const token = req.cookies.get("admin_token")?.value;
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: req.method, headers, body });
  } catch {
    return NextResponse.json(
      { message: "Không kết nối được backend" },
      { status: 502 },
    );
  }

  // Buffer toàn bộ để tránh rắc rối stream/tee khi vừa forward vừa đọc JSON
  const buf = await upstream.arrayBuffer();
  const out = new NextResponse(buf, {
    status: upstream.status,
    headers: pickHeaders(upstream.headers),
  });

  // Login/làm mới: lấy token BE trả trong body, set cookie trên domain admin
  // để middleware đọc được (cookie BE set thuộc domain BE, vô dụng ở đây).
  //
  // `POST /admin/refresh` trả **cả hai** token nên nó dùng chung đúng nhánh này.
  // Trước đây refresh không tồn tại, nên access token hết hạn 30 phút là đăng
  // xuất cứng.
  if ((path === "admin/login" || path === "admin/refresh") && upstream.ok) {
    try {
      const data = JSON.parse(Buffer.from(buf).toString("utf-8")) as {
        token?: string;
        refreshToken?: string;
      };
      if (data?.token) {
        out.cookies.set("admin_token", data.token, adminCookieOptions(ADMIN_ACCESS_TTL_MS));
      }
      if (data?.refreshToken) {
        out.cookies.set("admin_refresh", data.refreshToken, adminCookieOptions(ADMIN_REFRESH_TTL_MS));
      }
    } catch {
      // body không phải JSON thì bỏ qua
    }
  }
  if (path === "admin/logout") {
    out.cookies.delete("admin_token");
    // Phải xoá cả cookie làm mới: nó sống 7 ngày, để lại thì "Đăng xuất" chỉ có
    // tác dụng trong 30 phút rồi phiên tự sống lại.
    out.cookies.delete("admin_refresh");
  }
  return out;
}

export async function GET(req: NextRequest) {
  return proxy(req);
}
export async function POST(req: NextRequest) {
  return proxy(req);
}
export async function PUT(req: NextRequest) {
  return proxy(req);
}
export async function DELETE(req: NextRequest) {
  return proxy(req);
}
export async function PATCH(req: NextRequest) {
  return proxy(req);
}
