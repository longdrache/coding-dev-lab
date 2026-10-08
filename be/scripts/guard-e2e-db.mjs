#!/usr/bin/env node
// Chốt an toàn cho `pnpm test:e2e`.
//
// Vì sao: be/.env khai DATABASE_URL trỏ thẳng vào Neon production, nên mỗi
// lần chạy e2e là ghi vào DB thật rồi xoá lại. Cleanup hiện có giới hạn đúng
// (chỉ `e2e@test.local` và `/e2e-probe`), nên chưa mất dữ liệu — nhưng đây là
// khoảng hở không cần thiết, và làm test phụ thuộc mạng production.
//
// Cách dùng:
//   pnpm test:e2e                     -> chặn nếu trỏ Neon
//   E2E_ALLOW_PROD=1 pnpm test:e2e    -> cho qua, có chủ đích
//   DATABASE_URL=postgresql://localhost:5432/gocode_test pnpm test:e2e
//
// Fail closed: không đọc được DATABASE_URL thì cũng chặn, vì đó gần như chắc
// chắn là cấu hình sai.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import "dotenv/config";
const NEON = /neon\.tech/i;

function readUrlFromEnvFile() {
  for (const rel of ['.env', '../.env']) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    const line = readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^DATABASE_URL\s*=/.test(l.trim()));
    if (!line) continue;
    const raw = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    if (raw) return { value: raw, from: p };
  }
  return null;
}

const fromProcess = process.env.DATABASE_TEST_URL;
console.log(fromProcess)
const url = fromProcess ? { value: fromProcess, from: 'process.env' } : readUrlFromEnvFile();

if (!url) {
  console.error(
    '\n[guard-e2e-db] KHONG doc duoc DATABASE_URL.\n' +
      '  pnpm test:e2e can mot Postgres. Hay dat DATABASE_URL, hoac khoi dong\n' +
      '  Postgres local roi tro `pnpm test:e2e` vao no.\n',
  );
  process.exit(1);
}

let host = '';
try {
  host = new URL(url.value).hostname;
} catch {
  console.error(`\n[guard-e2e-db] DATABASE_URL khong phai URL hop le: ${url.value}\n`);
  process.exit(1);
}

if (NEON.test(host) && process.env.E2E_ALLOW_PROD !== '1') {
  console.error(
    '\n' +
      '='.repeat(72) +
      '\n[guard-e2e-db] DA CHAN: DATABASE_URL tro toi Neon\n' +
      '='.repeat(72) +
      `\n  host   : ${host}\n` +
      `  nguon  : ${url.from}\n` +
      '\n  Test e2e se GHI vao database nay (roi xoa lai). Neu day la\n' +
      '  production, ban khong nen chay mac dinh.\n' +
      '\n  Chay test tren Postgres local:\n' +
      '    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/gocode_test pnpm test:e2e\n' +
      '\n  Neu ban muon chay co chu dich tren Neon:\n' +
      '    E2E_ALLOW_PROD=1 pnpm test:e2e\n' +
      '='.repeat(72) +
      '\n',
  );
  process.exit(1);
}

console.error(`[guard-e2e-db] OK — ${host} (${url.from})`);
