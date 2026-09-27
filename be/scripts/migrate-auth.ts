import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Xoá dữ liệu user. `Problem` và toàn bộ nội dung bài giữ nguyên.
  // Một transaction duy nhất: lỗi giữa chừng thì rollback hết, không để lại
  // dữ liệu xoá dở.
  await db.$transaction([
    // Con trước cha: UserToken có onDelete Cascade nhưng vẫn xoá tường minh
    // để thứ tự đọc là đúng, và để script không phụ thuộc hành vi cascade.
    db.userToken.deleteMany({}),
    db.userBadge.deleteMany({}),
    db.solvedProblem.deleteMany({}),
    db.favoriteProblem.deleteMany({}),
    db.submission.deleteMany({}),
    db.activityDay.deleteMany({}),
    db.pageView.deleteMany({}),
    db.loginEvent.deleteMany({}),
    db.user.deleteMany({}),
  ]);

  const problems = await db.problem.count();
  console.log('Đã xoá dữ liệu user. Kiểm tra lại số bài:');
  console.log('problems =', problems);
  if (problems === 0) {
    console.error(
      'Cảnh báo: bảng Problem đang rỗng — nhiều khả năng đã xoá nhầm nội dung bài. Dừng lại, hãy khôi phục từ file backup.',
    );
    process.exit(1);
  }
}

main()
  .catch((err: unknown) => {
    console.error('Xoá dữ liệu user thất bại:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
