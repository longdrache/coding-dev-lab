import test from "node:test";
import assert from "node:assert/strict";

/**
 * Vòng đời phiên admin, đo bằng đồng hồ giả — không có `sleep` nào ở file này.
 *
 * Admin là **app riêng**, không dùng luồng của `FE/`: token admin do
 * `be/src/admin/admin.service.ts` ký (access 30 phút), phiên nằm trong cookie
 * `admin_token` + `admin_refresh` do BFF proxy đặt, và **không** có hàng đợi
 * phiên 10 thiết bị như user thường. Trước khi có `/admin/refresh` thì hết 30
 * phút là đăng xuất cứng — cùng triệu chứng, khác hạn.
 *
 * File dùng `node --test` (không thêm dependency) nên đồng hồ giả đến từ
 * `mock.timers` của chính Node, không phải vitest.
 */

/**
 * Nạp `lib/api.ts`.
 *
 * `node --test` chạy file `.mjs` nhưng Node >= 22.18 tự bóc kiểu của file `.ts` khi
 * `import()` — nên không cần loader hay dependency nào. Điều kiện ở dưới là để
 * hỏng **rõ ràng** chứ không phải âm thầm: trên Node cũ, `import` file `.ts` sẽ
 * ném lỗi khó hiểu và test đỏ vì lý do sai.
 */
async function loadApi() {
  if (!process.features.typescript) {
    throw new Error("Can Node >= 22.18 de import() duoc file TypeScript.");
  }
  return import(new URL("./lib/api.ts", import.meta.url).href);
}

const ADMIN_ACCESS_TTL_MS = 30 * 60 * 1000;
const ADMIN_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Response tối thiểu — chỉ những gì `adminFetch` thật sự đọc. */
function res(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * BE giả bám đúng hợp đồng thật: access token 30 phút, refresh token 7 ngày,
 * xoay vòng mỗi lần refresh.
 */
function fakeBe(overrides = {}) {
  const now = Date.now();
  const be = {
    accessUntil: now + ADMIN_ACCESS_TTL_MS,
    refreshToken: "refresh-ban-dau",
    refreshUntil: now + ADMIN_REFRESH_TTL_MS,
    rotations: 0,
    calls: { refresh: 0 },
    ...overrides,
  };
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(url);
    if (url === "/api/admin/refresh") {
      be.calls.refresh += 1;
      if (!(init.method === "POST")) return res(405, { message: "sai method" });
      const nowMs = Date.now();
      if (be.refreshToken === "" || nowMs >= be.refreshUntil) {
        return res(401, { message: "Phiên admin đã hết hạn" });
      }
      const moi = `refresh-moi-${be.rotations + 1}`;
      be.refreshToken = moi;
      be.refreshUntil = nowMs + ADMIN_REFRESH_TTL_MS;
      be.accessUntil = nowMs + ADMIN_ACCESS_TTL_MS;
      be.rotations += 1;
      return res(200, { ok: true, token: "access-moi", refreshToken: moi });
    }
    if (Date.now() < be.accessUntil) return res(200, { ok: true });
    return res(401, { message: "Token không hợp lệ" });
  };
  return { be, calls };
}

function restore() {
  delete globalThis.fetch;
}

test("hết 30 phút thì làm mới được, KHÔNG bị đẩy ra /sign-in", async (t) => {
  const api = await loadApi();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  const { be, calls } = fakeBe();
  t.after(restore);

  // Trước mốc 30 phút: không tốn lần refresh nào.
  assert.equal((await api.adminFetch("/api/admin/stats")).status, 200);
  assert.equal(be.rotations, 0);

  // Vượt mốc 30 phút — mọi request giờ 401, đúng cái làm admin bị mất phiên.
  t.mock.timers.tick(ADMIN_ACCESS_TTL_MS + 1000);
  const r = await api.adminFetch("/api/admin/stats");

  assert.equal(r.status, 200, "phai refresh roi gui lai, khong phai tra 401");
  assert.equal(be.rotations, 1, "dung mot lan xoay vong");
  assert.ok(calls.includes("/api/admin/refresh"), "phai co goi /api/admin/refresh");
  t.mock.timers.reset();
});

test("vượt nhiều mốc 30 phút liên tiếp thì phiên vẫn sống", async (t) => {
  const api = await loadApi();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  const { be } = fakeBe();
  t.after(restore);

  for (let i = 0; i < 10; i += 1) {
    const r = await api.adminFetch("/api/admin/stats");
    assert.equal(r.status, 200, `lan ${i} phai van con phien`);
    t.mock.timers.tick(ADMIN_ACCESS_TTL_MS + 1000);
  }

  // 10 mốc × 30 phút = hơn 5 giờ, còn xa mốc 7 ngày.
  assert.ok(Date.now() < be.refreshUntil);
  // Lần đầu access token còn hạn nên không tốn refresh token; 9 lần sau đều phải
  // xoay vòng — và cả 10 lần đều trả 200, không lần nào là 401.
  assert.equal(be.rotations, 9);
  t.mock.timers.reset();
});

test("hết 7 ngày thì đăng xuất THẬT", async (t) => {
  const api = await loadApi();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  const { be } = fakeBe({ accessUntil: Date.now() - 1, refreshUntil: Date.now() - 1 });
  t.after(restore);

  const r = await api.adminFetch("/api/admin/stats");

  assert.equal(r.status, 401);
  assert.equal(be.rotations, 0);
  t.mock.timers.reset();
});

test("bị gỡ phiên (refresh bị từ chối) thì cũng là hết phiên thật", async (t) => {
  const api = await loadApi();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  // `refreshToken === ''` là hệ quả của `logout` xoá dòng/token ở phía server.
  const { be } = fakeBe({ accessUntil: Date.now() - 1, refreshToken: "" });
  t.after(restore);

  assert.equal((await api.adminFetch("/api/admin/stats")).status, 401);
  assert.equal(be.rotations, 0);
  t.mock.timers.reset();
});

test("kiểm tra phiên KHÔNG được tiêu refresh token", async (t) => {
  const api = await loadApi();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  const { be, calls } = fakeBe();
  t.after(restore);

  const tokenDau = be.refreshToken;
  for (let i = 0; i < 5; i += 1) {
    await api.adminFetch("/api/admin/stats");
  }

  assert.equal(be.rotations, 0, "chi doc trang thai thi khong duoc xoay vong token");
  assert.equal(be.refreshToken, tokenDau);
  assert.equal(calls.filter((u) => u === "/api/admin/refresh").length, 0);
  t.mock.timers.reset();
});

test("nhiều request cùng 401 thì chỉ MỘT lần gọi /refresh", async (t) => {
  const api = await loadApi();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  // Access token chết sẵn, và lần refresh đầu tiên mới làm nó sống lại.
  const { be, calls } = fakeBe({ accessUntil: Date.now() - 1 });
  t.after(restore);

  // Bốn request chạy đồng thời — y hệt màn dashboard bắn nhiều `useSWR`.
  const all = await Promise.all([
    api.adminFetch("/api/admin/stats"),
    api.adminFetch("/api/admin/qna"),
    api.adminFetch("/api/admin/users"),
    api.adminFetch("/api/admin/submissions"),
  ]);

  for (const r of all) assert.equal(r.status, 200);
  assert.equal(
    calls.filter((u) => u === "/api/admin/refresh").length,
    1,
    "moi duoc xoay vong token MOT lan du da tranh nhau",
  );
  assert.equal(be.rotations, 1);
  t.mock.timers.reset();
});

test("5xx / lỗi mạng thì KHÔNG coi là hết phiên, KHÔNG gọi refresh", async (t) => {
  const api = await loadApi();
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return url === "/api/admin/refresh"
      ? res(200, { ok: true })
      : res(503, { message: "BE chập chờn" });
  };
  t.after(restore);

  const r = await api.adminFetch("/api/admin/stats");

  assert.equal(r.status, 503, "phai tra nguyen 503 cho caller tu hien loi");
  assert.equal(
    calls.filter((u) => u === "/api/admin/refresh").length,
    0,
    "loi tam cua server khong phai het phien, khong duoc goi refresh",
  );
});

test("lỗi mạng thì trả 502 chứ không vỡ `res.ok` của caller", async (t) => {
  const api = await loadApi();
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  t.after(restore);

  const r = await api.adminFetch("/api/admin/stats");

  assert.equal(r.status, 502);
  assert.equal(r.ok, false);
});

test("isSessionOver chỉ nhận 401, không nhận 5xx", async () => {
  const api = await loadApi();

  assert.equal(api.isSessionOver(401), true);
  assert.equal(api.isSessionOver(403), false);
  assert.equal(api.isSessionOver(500), false);
  assert.equal(api.isSessionOver(503), false);
  assert.equal(api.isSessionOver(502), false);
  assert.equal(api.isSessionOver(200), false);
});

test("route làm mới không tự gọi lại chính nó (không lặp vô hạn)", async (t) => {
  const api = await loadApi();
  let lan = 0;
  globalThis.fetch = async () => {
    lan += 1;
    return res(401, { message: "het phien" });
  };
  t.after(restore);

  await api.adminFetch(api.ADMIN_REFRESH_PATH, { method: "POST" });

  assert.equal(lan, 1, "chi mot lan goi, khong loop");
});

test("sau khi refresh xong thì lần gọi sau dùng lại được (không dùng kết quả cũ)", async (t) => {
  const api = await loadApi();
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-01-01T00:00:00Z") });
  const { be } = fakeBe({ accessUntil: Date.now() - 1 });
  t.after(restore);

  await api.adminFetch("/api/admin/stats");
  assert.equal(be.rotations, 1);

  // Access token lại sống 30 phút nữa nên lần này không cần refresh.
  await api.adminFetch("/api/admin/stats");
  assert.equal(be.rotations, 1, "lan sau dung token moi, khong xoay vong lai");
  t.mock.timers.reset();
});