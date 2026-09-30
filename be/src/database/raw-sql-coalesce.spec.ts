import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression: `COALESCE` phải đồng nhất kiểu — Postgres **không** tự cast các
 * nhánh, nên trộn `integer` với `text` là lỗi lúc *lập kế hoạch*:
 * `COALESCE types integer and text cannot be matched`.
 *
 * Lỗi này đã từng lên production: `PageView.userId` đổi từ `clerkId` (text) sang
 * `userId` (integer) mà SQL thô trong `views.service.ts` không sửa theo, nên
 * `GET /api/admin/analytics/views` trả 500 — **và không unit test nào bắt được**,
 * vì `views.service.spec.ts` mock `$queryRaw` bằng `vi.fn()` nên không SQL nào
 * chạy thật, còn `tsc`/`nest build` không đụng tới SQL.
 *
 * Tầng bảo vệ ở đây: đọc `prisma/schema.prisma` để biết **kiểu Postgres thật**
 * của từng cột, rồi soi mọi SQL thô trong `be/src` — không cần database, nên
 * chạy ở `pnpm test` trên mọi lần CI. Lỗi kiểu này bị chặn ngay ở source, trước
 * khi có dữ liệu nào để hỏng. Lớp e2e trên Postgres thật nằm ở
 * `test/api.e2e-spec.ts`; tầng này bảo vệ phần "đổi kiểu cột mà quên sửa SQL".
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '..');
const beDir = resolve(here, '..', '..');
const schemaPath = join(beDir, 'prisma', 'schema.prisma');

/** Kiểu Prisma -> kiểu Postgres. Chỉ cần đủ cho các kiểu cột đang dùng. */
const PG_TYPE: Record<string, string> = {
  string: 'text',
  text: 'text',
  uuid: 'uuid',
  int: 'integer',
  integer: 'integer',
  smallint: 'smallint',
  bigint: 'bigint',
  serial: 'integer',
  float: 'double precision',
  double: 'double precision',
  decimal: 'numeric',
  boolean: 'boolean',
  bool: 'boolean',
  datetime: 'timestamp',
  timestamp: 'timestamp',
  json: 'jsonb',
  jsonb: 'jsonb',
  bytes: 'bytea',
};

type Column = { model: string; name: string; pgType: string };

/** `schema.prisma` -> danh sách cột, bỏ qua `@@index`/`@@map`. */
function docCot(): Column[] {
  const src = readFileSync(schemaPath, 'utf8');
  const out: Column[] = [];
  for (const khoi of src.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const model = khoi[1];
    for (const dong of khoi[2].split(/\r?\n/)) {
      const d = dong.trim();
      if (!d || d.startsWith('//') || d.startsWith('@@')) continue;
      const m = d.match(/^(\w+)\s+(\w+)/);
      if (!m) continue;
      const pgType = PG_TYPE[m[2].toLowerCase()];
      if (pgType) out.push({ model, name: m[1], pgType });
    }
  }
  return out;
}

const COT = docCot();

function pgTypeCua(model: string | null, cot: string): string | null {
  const c = COT.find((x) => x.name === cot && (model === null || x.model === model));
  return c ? c.pgType : null;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const abs = join(dir, e);
    if (statSync(abs).isDirectory()) {
      if (e === 'generated') continue;
      walk(abs, out);
    } else if (e.endsWith('.ts') && !e.endsWith('.spec.ts')) {
      out.push(abs);
    }
  }
  return out;
}

type RawQuery = { file: string; sql: string };

/** Mọi SQL thô viết bằng tagged template của Prisma. */
function rawQueries(): RawQuery[] {
  const out: RawQuery[] = [];
  const re = /\$(?:queryRaw|executeRaw)(?:<[\s\S]*?>)?\s*`([\s\S]*?)`/g;
  for (const file of walk(srcDir)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) {
      out.push({ file: relative(srcDir, file).split(sep).join('/'), sql: m[1] });
    }
  }
  return out;
}

/** Cắt phần trong ngoặc của một lời gọi hàm; `mo` là index của dấu `(` mở. */
function noiNgoac(sql: string, mo: number): string {
  for (let i = mo + 1; i < sql.length; i++) {
    if (sql[i] === ')') return sql.slice(mo + 1, i);
  }
  return sql.slice(mo + 1);
}

/** Tách đối số ở cấp ngoài cùng, không tách trong `COALESCE(...)` con. */
function tachDoiSo(ngoi: string): string[] {
  const out: string[] = [];
  let sau = 0;
  for (let i = 0; i < ngoi.length; i++) {
    if (ngoi[i] === '(') sau++;
    else if (ngoi[i] === ')') sau--;
    else if (ngoi[i] === ',' && sau === 0) {
      out.push(ngoi.slice(0, i));
      ngoi = ngoi.slice(i + 1);
      i = -1;
    }
  }
  out.push(ngoi);
  return out.map((s) => s.trim()).filter(Boolean);
}

type VongCoalesce = { text: string; args: string[] };

function vongCoalesce(sql: string): VongCoalesce[] {
  const out: VongCoalesce[] = [];
  for (const m of sql.matchAll(/COALESCE\s*\(/gi)) {
    const mo = m.index + m[0].length - 1; // index của `(`
    const ngoi = noiNgoac(sql, mo);
    out.push({ text: `${m[0]}${ngoi})`, args: tachDoiSo(ngoi) });
  }
  return out;
}

/** Bảng nào trong phạm vi câu query — để tra `"cột"` không viết rõ bảng. */
function bangTrongCau(sql: string): string[] {
  return [...sql.matchAll(/(?:FROM|JOIN)\s+"(\w+)"/g)].map((m) => m[1]);
}

/** Tách `::cast` ở cuối: `"userId"::text` -> { cot: '"userId"', cast: 'text' }. */
function tachCast(arg: string): { cot: string; cast: string | null } {
  const m = arg.match(/^(.*?)::\s*([A-Za-z_][\w ]*)$/);
  if (!m) return { cot: arg, cast: null };
  return { cot: m[1].trim(), cast: m[2].trim().toLowerCase() };
}

/**
 * Kiểu Postgres của một nhánh `COALESCE`, đã tính cả `::cast`.
 *
 * - `null` = không xác định được và **không phải** cột được nêu tên (lời gọi
 *   hàm, subquery...). Cột nêu tên mà tra schema không ra thì trả `null` kèm cờ
 *   `cot` để bộ quét vẫn bắt — tên lạ thì phải cast tường minh.
 */
function kieuNhanh(
  arg: string,
  bang: string[],
): { pgType: string | null; laCot: boolean } {
  const { cot, cast } = tachCast(arg);
  if (cast) return { pgType: PG_TYPE[cast] ?? cast, laCot: false };
  if (/^'[^']*'$/.test(cot)) return { pgType: 'text', laCot: false };
  if (/^-?\d+(\.\d+)?$/.test(cot)) return { pgType: 'number', laCot: false };

  const m = cot.match(/^"(\w+)"\s*\.\s*"(\w+)"$/) ?? cot.match(/^"(\w+)"$/);
  if (!m) return { pgType: null, laCot: false };
  if (m.length === 3) return { pgType: pgTypeCua(m[1], m[2]), laCot: true };
  const khop = COT.filter((c) => c.name === m[1] && bang.includes(c.model));
  return { pgType: khop.length === 1 ? khop[0].pgType : null, laCot: true };
}

const coCast = (arg: string) => /::\s*[A-Za-z_]/.test(arg);

/**
 * Một `COALESCE` chỉ hợp lệ khi **mọi** nhánh cùng kiểu. Chấp nhận theo ba cách:
 * mọi nhánh đều `::cast` rõ ràng, hoặc các nhánh đều cùng kiểu theo schema
 * (kiểu lấy từ `prisma/schema.prisma`), hoặc không nhánh nào là cột nêu tên mà
 * tra không ra kiểu. Trộn `integer` với `text` mà không cast là lỗi 500 runtime.
 */
export function viPhamCoalesce(sql: string): string[] {
  const bang = bangTrongCau(sql);
  const loi: string[] = [];
  for (const v of vongCoalesce(sql)) {
    const args = v.args.map((a) => kieuNhanh(a, bang));
    if (!args.some((a) => a.laCot)) continue;
    if (v.args.every(coCast)) continue;
    const kieu = args.map((a) => a.pgType);
    const ro = new Set(kieu.filter((k): k is string => k !== null));
    const cotChuaRoi = args.some((a) => a.laCot && a.pgType === null);
    if (cotChuaRoi || ro.size > 1) {
      loi.push(`${v.text} -> [${kieu.map((k) => k ?? 'không rõ').join(', ')}]`);
    }
  }
  return loi;
}

// ---------------------------------------------------------------- test

const QUERIES = rawQueries();

describe('SQL thô: COALESCE không được trộn kiểu', () => {
  it('bộ quét thật sự tìm thấy SQL thô trong be/src', () => {
    // Chốt "xanh oan": nếu regex hỏng, danh sách rỗng và mọi assert dưới đây
    // xanh vô nghĩa. Số 4 = 3 trong views.service.ts + 1 trong admin.service.ts.
    expect(QUERIES.length).toBeGreaterThanOrEqual(4);
    expect(QUERIES.some((q) => q.file.endsWith('views/views.service.ts'))).toBe(true);
  });

  it('bộ quét tự bắt được lỗi trộn kiểu và tha lỗi khi đã cast', () => {
    // Tự kiểm bộ quét: cùng một hàm phải đỏ với câu hỏng và xanh với câu đã sửa.
    const hong = `SELECT COUNT(DISTINCT COALESCE("userId", "visitorId", "ipHash")) FROM "PageView"`;
    expect(viPhamCoalesce(hong)).toHaveLength(1);

    const daCast = `SELECT COUNT(DISTINCT COALESCE("userId"::text, "visitorId", "ipHash")) FROM "PageView"`;
    expect(viPhamCoalesce(daCast)).toEqual([]);

    const cungKieu = `SELECT COALESCE("visitorId", "ipHash") FROM "PageView"`;
    expect(viPhamCoalesce(cungKieu)).toEqual([]);
  });

  it('mọi COALESCE trong be/src đều đồng nhất kiểu', () => {
    const loi: string[] = [];
    for (const q of QUERIES) {
      for (const v of viPhamCoalesce(q.sql)) loi.push(`${q.file}: ${v}`);
    }
    expect(
      loi,
      `Postgres không tự cast các nhánh COALESCE, nên trộn kiểu là lỗi 500 lúc runtime:\n  ${loi.join('\n  ')}`,
    ).toEqual([]);
  });
});
