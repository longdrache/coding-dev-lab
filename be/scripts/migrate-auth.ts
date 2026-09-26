import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Xoá dữ liệu user. `Problem` và toàn bộ nội dung bài giữ nguyên.
  await db.userBadge.deleteMany({});
  await db.solvedProblem.deleteMany({});
  await db.favoriteProblem.deleteMany({});
  await db.submission.deleteMany({});
  await db.activityDay.deleteMany({});
  await db.pageView.deleteMany({});
  await db.loginEvent.deleteMany({});
  await db.user.deleteMany({});
  console.log('Đã xoá dữ liệu user. Kiểm tra lại số bài:');
  console.log('problems =', await db.problem.count());
}
main().finally(() => db.$disconnect());
