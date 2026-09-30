const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const P = "app/forgot-password/page.tsx";
const L = "lib/forgot-limit.ts";

const MUTS = [
  ["B1 bo chan `lock.locked` trong onSubmit", P, "if (lock.locked || busy) return;", "if (busy) return;"],
  ["B2 bo `lock.locked` khoi `disabled` cua nut", P, "disabled={busy || lock.locked}", "disabled={busy}"],
  ["B3 bo so lan (khong bao gio khoa)", L, "if (live.length < FORGOT_SEND_LIMIT) {", "if (live.length < 9999) {"],
  ["B4 dem nguoc lech 60s", L, "oldest + FORGOT_WINDOW_MS - now", "oldest + FORGOT_WINDOW_MS - now + 60_000"],
  ["B5 cua so khong truot (co dinh danh sach)", L, "return sends.filter((at) => now - at < FORGOT_WINDOW_MS);", "return sends.slice();"],
  ["B6 bo ghi so lan vao storage (F5 reset duoc)", L, "    store.setItem(FORGOT_STORE_KEY, JSON.stringify(next));\n", ""],
  ["B8 bo aria-hidden khoi dong ho (spam trinh doc man hinh)", P, '<p aria-hidden className="flex items-center gap-1.5', '<p className="flex items-center gap-1.5'],
  ["B9 bo role=status (thong bao khong toi trinh doc man hinh)", P, '<p role="status" aria-live="polite" aria-atomic="true" className="sr-only">', '<p className="sr-only">'],
  ["B10 bo aria-live=polite (doc cat ngan)", P, ' aria-live="polite" aria-atomic="true"', ' aria-atomic="true"'],
  ["B11 dem nguoc lay Math.max cua ca danh sach thay vi nho nhat", L, "const oldest = Math.min(...live);", "const oldest = Math.max(...live);"],
];

function applyLast(file, from, to) {
  const src = snap[file];
  const at = src.lastIndexOf(from);
  if (at === -1) throw new Error("khong tim thay: " + from);
  fs.writeFileSync(file, src.slice(0, at) + to + src.slice(at + from.length), "utf8");
}
const snap = Object.fromEntries([P, L].map((f) => [f, fs.readFileSync(f, "utf8")]));

function run() {
  const r = spawnSync(
    "node",
    ["./node_modules/vitest/vitest.mjs", "run", "lib/forgot-limit.test.ts", "--reporter=json"],
    { encoding: "utf8" },
  );
  const out = r.stdout || "";
  if (/JSON report written to/.test(out)) {
    try {
      const j = JSON.parse(fs.readFileSync(".vitest/json/output.json", "utf8"));
      const names = (j.testResults || []).flatMap((f) =>
        (f.assertionResults || []).filter((a) => a.status === "failed").map((a) => a.fullName),
      );
      return { total: j.numTotalTests, failed: j.numFailedTests, names };
    } catch (e) {
      return { total: "?", failed: "?", names: ["LOI DOC JSON: " + e.message] };
    }
  }
  const start = out.indexOf("{");
  if (start === -1) return { total: "?", failed: "?", names: ["KHONG DOC DUOC JSON: " + out.slice(0, 200)] };
  try {
    const j = JSON.parse(out.slice(start));
    const names = (j.testResults || []).flatMap((f) =>
      (f.assertionResults || []).filter((a) => a.status === "failed").map((a) => a.fullName),
    );
    return { total: j.numTotalTests, failed: j.numFailedTests, names };
  } catch (e) {
    return { total: "?", failed: "?", names: ["LOI JSON: " + e.message] };
  }
}

function restore() {
  for (const f of [P, L]) fs.writeFileSync(f, snap[f], "utf8");
}

const lines = [];
const base = run();
lines.push(`BASELINE (khong mutate): ${base.failed}/${base.total} do`);
if (base.failed !== 0) lines.push("  !! baseline dang do, sua truoc khi ket luan gi");
for (const [name, file, from, to] of MUTS) {
  if (!snap[file].includes(from)) {
    lines.push(`SKIP  ${name} :: KHONG TIM THAY chuoi can mutate`);
    continue;
  }
  applyLast(file, from, to);
  const r = run();
  restore();
  lines.push(`MUT   ${name}`);
  lines.push(`  => ${r.failed}/${r.total} do`);
  for (const n of r.names) lines.push(`     - ${n}`);
}
restore();
const last = run();
lines.push(`Khoi phuc xong: ${last.failed}/${last.total} do`);
fs.writeFileSync(".mutresult.txt", lines.join("\n"), "utf8");
console.log(lines.join("\n"));
