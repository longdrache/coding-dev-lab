// Seed DEMO cho analytics (PageView + LoginEvent) để dashboard có hình.
// CHỈ chạy khi cần xem thử giao diện. Xóa bằng:
//   await db.pageView.deleteMany({ where: { path: { startsWith: '/demo-seed' } } }) -- không dùng,
// cách xóa đúng: deleteMany theo createdAt trong khoảng seed (in ra bên dưới).
//
// CHỈ TẠO LƯỢT XEM CỦA KHÁCH (userId = null). `PageView.userId` và
// `LoginEvent.userId` giờ là khoá ngoại thật trỏ `User.id`; id giả sẽ vi phạm
// FK, mà tạo user thật trong DB thì rác dữ liệu (kế hoạch đã chọn xoá sạch dữ
// liệu user). Nên script này không sinh dòng "đã đăng nhập" — cần xem panel
// login thì hãy đăng nhập thật rồi chạy lại.
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// RNG ổn định để seed lần nào cũng giống nhau
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

const PATHS = ['/', '/problem', '/problem/two-sum', '/problem/fizz-buzz', '/premium', '/qna', '/roadmap'];
const COUNTRIES = ['VN', 'VN', 'VN', 'VN', 'VN', 'US', 'SG', 'JP', ''];
const VISITORS = Array.from({ length: 24 }, (_, i) => `demo-visitor-${i}`);

async function main() {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startAll = new Date(now.getTime() - 29 * dayMs);

  const views: Array<{ userId: null; visitorId: string | null; ipHash: string; country: string; path: string; createdAt: Date }> = [];
  for (let d = 29; d >= 0; d--) {
    const day = new Date(now.getTime() - d * dayMs);
    const wave = 1 + Math.sin(((29 - d) / 29) * Math.PI * 2) * 0.4;
    const n = Math.round((18 + rand() * 40) * wave);
    for (let i = 0; i < n; i++) {
      const at = new Date(day.getTime() - Math.floor(rand() * dayMs));
      if (at > now) continue;
      const v = VISITORS[Math.floor(rand() * VISITORS.length)];
      views.push({
        userId: null,
        visitorId: v,
        ipHash: createHash('sha256').update(`demo:${v}:${d}`).digest('hex'),
        country: COUNTRIES[Math.floor(rand() * COUNTRIES.length)],
        path: PATHS[Math.floor(rand() * PATHS.length)],
        createdAt: at,
      });
    }
  }
  // inserts theo batch 200 để không nghẽn pool
  for (let i = 0; i < views.length; i += 200) {
    await db.pageView.createMany({ data: views.slice(i, i + 200) });
  }

  const logins: Array<{ userId: null; ipHash: string; country: string; createdAt: Date }> = [];
  for (let d = 14; d >= 0; d--) {
    const n = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const at = new Date(now.getTime() - d * dayMs - Math.floor(rand() * dayMs));
      if (at > now) continue;
      logins.push({
        userId: null,
        ipHash: createHash('sha256').update(`demo-login:${d}:${i}`).digest('hex'),
        country: COUNTRIES[Math.floor(rand() * 6)],
        createdAt: at,
      });
    }
  }
  for (const l of logins) {
    await db.loginEvent.create({ data: l });
  }

  console.log(`seeded ${views.length} pageviews + ${logins.length} logins (demo_)`);
  console.log(`range from ${startAll.toISOString()} — xóa bằng createdAt >= mốc này + visitorId demo`);
  console.log('Lưu ý: mọi dòng đều userId = null (khách). Muốn panel login có tên, hãy đăng nhập thật.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
