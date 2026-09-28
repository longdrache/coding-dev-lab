import 'dotenv/config';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

// ---------------------------------------------------------------------------
// Phần thuần (tách ra để test được, không đụng database)
// ---------------------------------------------------------------------------

/** Chuyển 1 giá trị của Postgres thành literal SQL. */
export function toSqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`Gia tri khong phai so hop le: ${v}`);
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Buffer.isBuffer(v)) return `'\\x${v.toString('hex')}'`;
  if (Array.isArray(v)) return `'{${v.map(toSqlArrayItem).join(',')}}'`;
  // Nháy đơn phải nhân đôi, và escape backslash để dữ liệu không bị hiểu sai
  // khi Postgres bật standard_conforming_strings=off.
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function toSqlArrayItem(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (typeof v === 'boolean') return v ? 't' : 'f';
  const s = String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${s}"`;
}

/** Một câu INSERT cho 1 dòng. */
export function buildInsert(table: string, columns: string[], row: Record<string, unknown>): string {
  if (columns.length === 0) throw new Error('Dong khong co cot nao');
  for (const c of columns) {
    if (!(c in row)) throw new Error(`Thieu cot "${c}" trong dong cua bang "${table}"`);
  }
  const cols = columns.map((c) => `"${c}"`).join(', ');
  const vals = columns.map((c) => toSqlLiteral(row[c])).join(', ');
  return `INSERT INTO "${table}" (${cols}) VALUES (${vals});`;
}

/** Ghép toàn bộ bảng thành một file SQL. */
export function buildDumpSql(
  tables: { table: string; columns: string[]; rows: Record<string, unknown>[] }[],
): string {
  const out: string[] = [
    '-- Backup sinh bang Node + pg (may nay khong co pg_dump).',
    '-- CHI giu DU LIEU: schema duoc tao lai bang `prisma migrate deploy`.',
    `-- Sinh luc: ${new Date().toISOString()}`,
    '',
  ];
  let total = 0;
  for (const { table, columns, rows } of tables) {
    out.push(`-- ${table}: ${rows.length} dong`);
    for (const r of rows) out.push(buildInsert(table, columns, r));
    out.push('');
    total += rows.length;
  }
  out.push(`-- TONG: ${total} dong tren ${tables.length} bang`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Phần đọc/ghi
// ---------------------------------------------------------------------------

/** Lấy DSN trực tiếp, ưu tiên biến không pooler. */
export function resolveDsn(): string {
  const dsn = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!dsn) {
    throw new Error(
      'Thieu DATABASE_URL_UNPOOLED (hoac DATABASE_URL). Khong dung PGHOST pooler cho dump.',
    );
  }
  if (/@.*pooler/i.test(dsn)) {
    throw new Error('DSN dang tro host pooler; hay dung DATABASE_URL_UNPOOLED de dump.');
  }
  return dsn;
}

export async function dump(db: Client): Promise<string> {
  const names = (
    await db.query(
      `select table_name from information_schema.tables
       where table_schema='public' and table_type='BASE TABLE'
       order by table_name`,
    )
  ).rows.map((r: { table_name: string }) => r.table_name);

  if (names.length === 0) throw new Error('Database khong co bang nao trong schema public.');

  const tables = [];
  for (const table of names) {
    // Ten bang lay tu information_schema nen khong can tham so hoa; nhung van
    // kiem tra de khong bao gio ghep SQL tu chuoi cong tu.
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
      throw new Error(`Ten bang khong an toan de chen vao SQL: ${table}`);
    }
    const columns = (
      await db.query(
        `select column_name from information_schema.columns
         where table_schema='public' and table_name='${table}'
         order by ordinal_position`,
      )
    ).rows.map((r: { column_name: string }) => r.column_name);
    const { rows } = await db.query(`select * from "${table}"`);
    tables.push({ table, columns, rows });
  }
  return buildDumpSql(tables);
}

export async function main(): Promise<void> {
  // Cố tình ghi ra NGOÀI repo: file backup chứa dữ liệu thật của người dùng.
  const OUT_DIR = 'E:\\github\\coding-dev-lab-backups';
  const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
  const OUT = join(OUT_DIR, `gocode-${STAMP}.sql`);
  mkdirSync(OUT_DIR, { recursive: true });

  const db = new Client({ connectionString: resolveDsn() });
  await db.connect();
  let sql: string;
  try {
    sql = await dump(db);
  } finally {
    await db.end();
  }

  // Backup rong nghia la bi loi ma ta khong nhan ra - phai fail loudly.
  writeFileSync(OUT, sql, 'utf8');
  const { size } = statSync(OUT);
  if (size === 0) throw new Error(`File backup rong: ${OUT}`);
  console.log(sql.split('\n').filter((l) => l.startsWith('-- TONG')).join(''));
  console.log(`Da sao luu: ${OUT} (${size} bytes)`);
}

// Chi chay khi goi truc tiep, de import de test khong bi ket noi database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
