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

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error('Thiếu DATABASE_URL');
mkdirSync(OUT_DIR, { recursive: true });

await run('pg_dump', ['--no-owner', '--no-acl', '-f', OUT, url]);

// Backup rỗng nghĩa là pg_dump chạy lỗi mà ta không nhận ra — phải fail loudly
// thay vì in ra đường dẫn tới file vô dụng.
const { size } = statSync(OUT);
if (size === 0) throw new Error(`File backup rỗng: ${OUT}`);
console.log(`Đã sao lưu: ${OUT} (${size} bytes)`);
