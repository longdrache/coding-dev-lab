import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AuthShell from "./AuthShell";
import ForgotPasswordPage from "../../app/forgot-password/page";
import ResetPasswordPage from "../../app/reset-password/page";
import NotFound from "../../app/not-found";

/**
 * Kicker `// …` đã bị gỡ khỏi màn auth, trang 404 và trang bài — rồi **quay lại**
 * ở đợt sau vì không có gì chặn. Lượt này test ba lớp:
 *
 * 1. Render thật rồi assert **chữ người đọc thấy** không còn `//` — bằng chứng
 *    trực tiếp, thay vì "trang vẫn render được".
 * 2. Ném prop `kicker` vào `AuthShell` như một thằng học thừa sẽ làm, và assert
 *    nó **không** hiện ra — chặn đúng chỗ sinh ra kicker.
 * 3. Quét **mọi** file trong `FE/app` và `admin/app` để bắt kicker quay lại ở
 *    màn chưa từng nằm trong test render này.
 *
 * `vitest.config.ts` chạy `environment: 'node'` (không jsdom) và chỉ nạp file
 * `.test.ts`, nên test dùng `react-dom/server` thay vì jsdom + RTL: không thêm
 * dependency nào, và render server đủ để soi **text hiện ra**.
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");

/**
 * `AuthShell` khai `children` trong kiểu props, nên `createElement` bắt buộc
 * truyền nó như prop. `react/no-children-prop` cấm đúng cách đó — ta gọi
 * `createElement` chứ không viết JSX, nên ép kiểu ở đây là đường duy nhất,
 * và chỉ chạm đúng tham số của lời gọi test.
 */
function renderShell(props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(AuthShell, props as never));
}

/** Bỏ `<script>`/`<style>` và mọi thẻ, chỉ chừa lại chữ người dùng đọc được. */
function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");
}

/** `//` trong chữ hiện ra = kicker quay lại. Đây là hợp đồng của cả file test. */
function expectNoKicker(html: string, where: string): void {
  expect(visibleText(html), `${where} hiện chữ chứa "//"`).not.toMatch(/\/\//);
}

describe("kicker // không được quay lại giao diện", () => {
  it.each([
    ["AuthShell", () => renderShell({ title: "Tiêu đề.", children: createElement("p", null, "ok") })],
    ["trang quên mật khẩu", () => renderToStaticMarkup(createElement(ForgotPasswordPage))],
    ["trang đặt mật khẩu mới", () => renderToStaticMarkup(createElement(ResetPasswordPage))],
    ["trang 404", () => renderToStaticMarkup(createElement(NotFound))],
  ])("%s không có chữ // hiện ra", (ten, render) => {
    expectNoKicker(render(), ten);
  });

  it("AuthShell bỏ qua prop kicker lạ, không render //", () => {
    // Khung không khai báo `kicker` nên `tsc` đã chặn lúc gọi. Test này chặn
    // lúc chạy: ai đó thêm lại prop thì giá trị này sẽ hiện ra ngay.
    const html = renderShell({ title: "Tiêu đề.", kicker: "// welcome back", children: createElement("p", null, "ok") });
    expectNoKicker(html, "AuthShell nhận prop kicker lạ");
  });
});

/** Mọi file nguồn Next mà người dùng cuối nhìn thấy: `FE/app` và `admin/app`. */
const SOURCE_ROOTS = [join(REPO_ROOT, "FE", "app"), join(REPO_ROOT, "admin", "app")];
const SOURCE_EXT = [".tsx", ".ts", ".jsx", ".js"];

/**
 * Ngoại lệ duy nhất: chỗ `//` là **mã nguồn được hiển thị**, không phải nhãn
 * trang trí. Xoá chúng là xoá sai — `//` ở đó là cú pháp comment thật.
 *
 * - `FE/app/data/code.ts`: dữ liệu cho ô code giả ở trang chủ; từng dòng đều là
 *   một dòng source JavaScript, `//` là comment trong đoạn code đó.
 * - `// Starter for …`: placeholder trong ô nhập starter code của trang tạo bài,
 *   admin nhìn thấy đúng hình dạng sẽ gõ vào.
 */
const ALLOWED = new Map<string, RegExp[]>([
  ["FE/app/data/code.ts", [/^\/\/ /]],
  ["admin/app/(dashboard)/problems/new/page.tsx", [/^\/\/ Starter for /]],
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (SOURCE_EXT.some((ext) => full.endsWith(ext))) out.push(full);
  }
  return out;
}

/** Các đoạn `/* … *\/` — comment code, không bao giờ tới trình duyệt. */
function blockCommentRanges(src: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /\/\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** Vị trí `file:line` của mọi string literal bắt đầu bằng `//`. */
function slashLiterals(src: string, file: string): string[] {
  const found: string[] = [];
  const comments = blockCommentRanges(src);
  const inComment = (i: number) => comments.some(([a, b]) => i >= a && i < b);
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!/^\s*\/\//.test(m[2])) continue;
    // `//` nằm trong comment dòng (`// …`) hoặc trong `/** … */` đều là
    // comment code: tiếng Việt có dấu, số dòng phải giữ nguyên.
    if (inComment(m.index)) continue;
    const lineStart = src.lastIndexOf("\n", m.index - 1) + 1;
    if (/^\s*\/\//.test(src.slice(lineStart, m.index))) continue;
    found.push(`${file}:${src.slice(0, m.index).split("\n").length}`);
  }
  return found;
}

describe("không mã nguồn nào sinh kicker //", () => {
  it("FE/app và admin/app không có string literal // trừ chỗ hiện mã nguồn", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const full of sourceFiles(root)) {
        const rel = relative(REPO_ROOT, full).split(sep).join("/");
        // File test này tự chứa chữ `//` trong assert và trong ngoại lệ ALLOWED.
        if (rel.endsWith("kicker.test.ts")) continue;
        const src = readFileSync(full, "utf8");
        const allowed = ALLOWED.get(rel) ?? [];
        for (const at of slashLiterals(src, rel)) {
          if (allowed.some((rx) => rx.test(literalAt(src, at)))) continue;
          offenders.push(at);
        }
      }
    }
    expect(offenders, `Kicker quay lại ở: ${offenders.join(", ")}`).toEqual([]);
  });

  it("không nơi nào còn khai báo hay truyền prop kicker", () => {
    // Bắt riêng vì một prop `kicker` có thể được dùng với giá trị không bắt
    // đầu bằng `//` — test trên không thấy, test này vẫn thấy.
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const full of sourceFiles(root)) {
        const rel = relative(REPO_ROOT, full).split(sep).join("/");
        if (rel.endsWith("kicker.test.ts")) continue;
        const src = readFileSync(full, "utf8");
        if (/\bkicker\s*=|\bkicker\??\s*:|\bKICKER\b/.test(src)) offenders.push(rel);
      }
    }
    expect(offenders, `Prop/hằng kicker còn sót ở: ${offenders.join(", ")}`).toEqual([]);
  });
});

/** Nội dung literal tương ứng với vị trí `file:line` mà `slashLiterals` trả về. */
function literalAt(src: string, at: string): string {
  const lineNo = Number(at.slice(at.lastIndexOf(":") + 1));
  const line = src.split("\n")[lineNo - 1] ?? "";
  const m = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/.exec(line);
  return m ? m[2] : "";
}
