import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regression: dashboard nuốt lỗi API và hiện ra thành số trống.
 *
 * `useSWR` **không** ném lỗi — nó đặt `error` vào giá trị trả về. Trang cũ chỉ
 * destructure `data`:
 *
 *     const { data: views } = useSWR("/api/admin/analytics/views", ...)
 *     ... {String(t.data?.views ?? "—") + " lượt xem"}
 *
 * Nên khi `GET /api/admin/analytics/views` trả 500 (đúng lúc lỗi SQL
 * `COALESCE` làm hỏng endpoint), người dùng thấy `"— lượt xem"` — trông như
 * "hôm nay chưa có ai xem", im lặng giấu chính sự cố. Lỗi chỉ lộ ra ở log
 * console.
 *
 * Test này khẳng định **hợp đồng render**, không soi cú pháp:
 *   1. Mọi `useSWR` trên trang phải lấy `error` (được đặt tên riêng).
 *   2. Mỗi tên `error` phải được một nhánh `if` chặn, và nhánh đó phải trả về
 *      JSX báo lỗi nhìn thấy được — không phải `null` hay ô trống.
 *   3. Nhánh chặn phải nằm **trước** chỗ dựng `?? "—"`, để endpoint hỏng không
 *      bao giờ tới được ô trống.
 *
 * Không phụ thuộc `.env` của máy: chỉ đọc source. `next build` không bắt được
 * lỗi này vì nó không render component.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = join(here, "app", "(dashboard)", "dashboard", "page.tsx");

/** Bỏ comment để test chỉ soi **code**, không soi văn xuôi trong docblock. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const code = stripComments(readFileSync(pagePath, "utf8"));

/** Mọi lời gọi `useSWR` cùng phần destructure và URL của nó. */
function swrHooks() {
  const re = /const\s*\{([^}]*)\}\s*=\s*useSWR(?:<[^>]*>)?\s*\(\s*["'`]([^"'`]+)["'`]/g;
  return [...code.matchAll(re)].map((m) => ({ binding: m[1], url: m[2] }));
}

/** Tên biến chứa lỗi của một hook: `error: viewsError` -> `viewsError`. */
function tenLoi(binding) {
  const m = binding.match(/\berror\s*:\s*(\w+)/);
  if (m) return m[1];
  return /\berror\b/.test(binding) ? "error" : null;
}

const HOOKS = swrHooks();
const TEN_LOI = HOOKS.map((h) => ({ ...h, ten: tenLoi(h.binding) }));
const DIEU_KIEN = [...code.matchAll(/if\s*\(([^)]*)\)/g)].map((m) => ({
  dieu_kien: m[1],
  vi: m.index,
}));
/** Đoạn JSX ngay sau một nhánh `if` — đủ để soi class báo lỗi. */
const sauIf = (vi) => code.slice(vi, vi + 600);

test("trang dashboard co it nhat 3 hook useSWR de soAT", () => {
  // Chốt "xanh oan": regex hỏng -> danh sách rỗng -> các test dưới xanh vô nghia.
  assert.ok(HOOKS.length >= 3, `chi thay ${HOOKS.length} hook useSWR tren dashboard`);
});

test("moi useSWR deu lay error, khong hook nao bo qua", () => {
  const bo = TEN_LOI.filter((h) => h.ten === null).map((h) => h.url);
  assert.deepEqual(
    bo,
    [],
    `useSWR khong nem loi ma gan vao bien error, nen bo qua error la loi API bien mat ` +
      `va hien ra thanh so trong. Hook dang bo qua: ${bo.join(", ")}`,
  );
});

test("moi bien error deu co nhanh if chan, va nhanh do bao loi nhin thay duoc", () => {
  for (const { url, ten } of TEN_LOI) {
    const nhanh = DIEU_KIEN.filter((d) => d.dieu_kien.includes(ten));
    assert.ok(
      nhanh.length > 0,
      `bien "${ten}" (tu useSWR "${url}") khong duoc dung trong dieu kien if nao ` +
        `=> loi cua endpoint do khong bao gio duoc hien`,
    );
    for (const n of nhanh) {
      assert.match(
        sauIf(n.vi),
        /text-red-\d+|role="alert"/,
        `nhanh if (${n.dieu_kien}) phai tra ve JSX bao loi nhin thay duoc ` +
          `(vi du class text-red-600 hoac role="alert")`,
      );
    }
  }
});

test('nhanh chan loi phai dung truoc cho fallback "—"', () => {
  // `?? "—"` là fallback khi endpoint trả payload rỗng. Nếu nhánh chặn lỗi
  // nằm sau chỗ này, endpoint 500 vẫn hiện ra thành một ô trống.
  const viFallback = code.indexOf('?? "—"');
  assert.notEqual(viFallback, -1, "khong tim thay fallback du lieu rong tren dashboard");

  const truoc = DIEU_KIEN.filter((d) => d.vi < viFallback);
  const coCham = TEN_LOI.some(({ ten }) => truoc.some((d) => d.dieu_kien.includes(ten)));
  assert.ok(
    coCham,
    'khong co nhanh chan loi nao nam truoc fallback "—" => API loi van hien ra ' +
      'thanh "— lượt xem" thay vì báo lỗi',
  );
});
