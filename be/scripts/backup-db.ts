import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const run = promisify(execFile);

// Cố tình ghi ra NGOÀI repo: file backup chứa dữ liệu thật của người dùng,
// không được lọt vào git lẽ ra .gitignore chỉ chống được file trong repo.
const OUT_DIR = 'E:\\github\\coding-dev-lab-backups';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(OUT_DIR, `gocode-pre-auth-${STAMP}.sql`);

// Không đưa DSN vào tham số dòng lệnh: mật khẩu sẽ lộ trong process list, và
// khi pg_dump fail, object lỗi của execFile có kèm `args` nên thông báo lỗi sẽ
// in nguyên DSN ra console. Chỉ truyền host/user/dbname ở argv, mật khẩu đi qua
// biến môi trường PGPASSWORD.
const host = process.env.PGHOST_UNPOOLED || process.env.PGHOST;
const user = process.env.PGUSER;
const database = process.env.PGDATABASE;
const password = process.env.PGPASSWORD;
if (!host || !user || !database || !password) {
  throw new Error('Thiếu cấu hình Postgres: cần PGHOST, PGUSER, PGDATABASE, PGPASSWORD');
}
mkdirSync(OUT_DIR, { recursive: true });

await run(
  'pg_dump',
  ['--no-owner', '--no-acl', '-f', OUT, '--host', host, '--username', user, '--dbname', database],
  { env: { ...process.env, PGPASSWORD: password, PGSSLMODE: 'require' } },
);

// Backup rỗng nghĩa là pg_dump chạy lỗi mà ta không nhận ra — phải fail loudly
// thay vì in ra đường dẫn tới file vô dụng.
const { size } = statSync(OUT);
if (size === 0) throw new Error(`File backup rỗng: ${OUT}`);
console.log(`Đã sao lưu: ${OUT} (${size} bytes)`);
