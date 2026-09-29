import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression: `proxy.ts` gửi người chưa đăng nhập tới `/login`, nhưng trang đó
 * đã được đổi tên thành `app/(auth)/sign-in/page.tsx`. Kết quả: `/sign-in` bị
 * proxy đẩy sang `/login` không tồn tại => **404**, và mọi route admin cũng 404
 * theo. `next build` không bắt được lỗi này vì nó không kiểm tra đích redirect
 * có tồn tại hay không.
 *
 * Test này suy ra danh sách URL trang thật từ đĩa (bỏ route group `(auth)` và
 * `route.ts`), rồi đối chiếu với mọi đường dẫn auth mà `proxy.ts` dùng. Không
 * phụ thuộc `.env` của máy: chỉ đọc source + cây thư mục.
 */

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "app");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** `app/(auth)/sign-in/page.tsx` -> `/sign-in`; route group `(auth)` không lọi vào URL. */
function urlOfPageFile(absFile) {
  const segments = relative(appDir, dirname(absFile))
    .split(sep)
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return `/${segments.join("/")}`.replace(/\/+$/, "") || "/";
}

const realPageUrls = new Set(
  walk(appDir)
    .filter((f) => f.endsWith(`page.tsx`))
    .map(urlOfPageFile),
);

const proxySrc = readFileSync(join(here, "proxy.ts"), "utf8");

/**
 * Đọc `const NAME = "..."` để theo dõi **giá trị** hằng số, không phải cú pháp.
 * Nhờ vậy đổi `LOGIN_PATH` sang một trang không tồn tại vẫn làm test đỏ, dù
 * redirect viết bằng hằng số thay vì chuỗi trần.
 */
const constValues = new Map(
  [...proxySrc.matchAll(/\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*["'`]([^"'`]+)["'`]/g)].map(
    (m) => [m[1], m[2]],
  ),
);

/** `"..."` hoặc tên hằng số đã biết -> giá trị đường dẫn. */
function resolvePath(token) {
  if (constValues.has(token)) return constValues.get(token);
  const literal = token.match(/^["'`]([^"'`]+)["'`]$/);
  return literal ? literal[1] : null;
}

/** Mọi đích `NextResponse.redirect(new URL(...))` trong proxy. */
const redirectTargets = [
  ...proxySrc.matchAll(/NextResponse\.redirect\(\s*new URL\(\s*([A-Za-z_][\w]*|["'`][^"'`]+["'`])/g),
]
  .map((m) => resolvePath(m[1]))
  .filter(Boolean);

/** Đường dẫn proxy coi là công khai: `path.startsWith(...)`. */
const publicPaths = [
  ...proxySrc.matchAll(/pathname\.startsWith\(\s*([A-Za-z_][\w]*|["'`][^"'`]+["'`])/g),
]
  .map((m) => resolvePath(m[1]))
  .filter(Boolean);

/** Đường dẫn matcher loại trừ: `"/((?!_next|favicon.ico|login|api).*)"`. */
const matcherExclusions = (() => {
  const lookahead = proxySrc.match(/\(\?\!\s*([^)]+)\)/);
  if (!lookahead) return [];
  return lookahead[1]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
})();

test("proxy co it mot duong dan auth, va no la route that", () => {
  const authPaths = new Set(
    [...redirectTargets, ...publicPaths].map((p) => p.replace(/^\/+|\/+$/g, "")),
  );
  assert.equal(authPaths.size, 1, `proxy dang dung nhieu duong dan auth: ${[...authPaths]}`);
  const only = [...authPaths][0];
  assert.ok(
    realPageUrls.has(`/${only}`),
    `proxy tro toi "/${only}" nhung app/ khong co trang nao. ` +
      `Trang that co: ${[...realPageUrls].sort().join(", ")}`,
  );
});

test("moi dich redirect cua proxy deu ton tai trong app/", () => {
  assert.ok(redirectTargets.length > 0, "khong tim thay redirect nao trong proxy.ts");
  for (const target of redirectTargets) {
    assert.ok(
      realPageUrls.has(target),
      `proxy redirect toi "${target}" nhung app/ khong co trang do ` +
        `=> 404. Trang that co: ${[...realPageUrls].sort().join(", ")}`,
    );
  }
});

test("trang auth that khong bi matcher dua vong quay ve chinh no", () => {
  const authPath = [...new Set([...publicPaths, ...redirectTargets].map((p) => p.replace(/^\/+/, "")))];
  for (const p of authPath) {
    assert.ok(
      matcherExclusions.includes(p),
      `matcher chua loai tru "${p}", nen trang dang nhap bi proxy dua ve chinh no ` +
        `=> vong 307/404. matcher loai tru: ${matcherExclusions.join(", ")}`,
    );
  }
});

/**
 * Bỏ comment để test chỉ soi **code**, không soi văn xuôi trong docblock — nhiều
 * comment giải thích chính cái lỗi này và phải được phép nhắc `/login`.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("khong con source nao tro toi duong dan /login cu", () => {
  // `router.push("/login")` trong component cung dang 404 sau khi trang doi
  // ten: client-side navigation toi route khong ton tai se hien trang 404.
  const offenders = [];
  for (const file of [join(here, "proxy.ts"), ...walk(appDir)]) {
    if (!/\.(ts|tsx|mjs)$/.test(file)) continue;
    const src = stripComments(readFileSync(file, "utf8"));
    for (const m of src.matchAll(/["'`]\/login(?:[/?#"'`]|$)/g)) {
      offenders.push(`${relative(here, file)} -> ${m[0]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `con duong dan /login cu (trang da doi ten sang /sign-in):\n  ${offenders.join("\n  ")}`,
  );
});
