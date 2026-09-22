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

  // Login: lấy token BE trả trong body, set cookie trên domain admin
  // để middleware đọc được (cookie BE set thuộc domain BE, vô dụng ở đây).
  if (path === "admin/login" && upstream.ok) {
    try {
      const data = JSON.parse(Buffer.from(buf).toString("utf-8")) as {
        token?: string;
      };
      if (data?.token) {
        out.cookies.set("admin_token", data.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });
      }
    } catch {
      // body không phải JSON thì bỏ qua
    }
  }
  if (path === "admin/logout") {
    out.cookies.delete("admin_token");
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
