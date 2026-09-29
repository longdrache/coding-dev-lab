import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { isVipProblem, problems, VIP_PROBLEM_COUNT, VIP_SLUGS } from '../../FE/app/data/problems.ts';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  for (const p of problems) {
    // `isVip` lấy từ quy tắc tất định trong `FE/app/data/problems.ts` chứ không
    // phải danh sách viết tay ở đây: người khác dựng lại DB phải ra **đúng** 20
    // bài đó, và bài thêm/xoá/đổi thứ tự sau này cũng tự được tính lại thay vì
    // phải sửa hai chỗ.
    const isVip = isVipProblem(p.slug);
    await db.problem.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        topic: p.topic,
        status: 'published',
        isVip,
        description: p.description,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        constraints: p.constraints,
        examples: p.examples,
        tests: p.tests,
        hiddenTests: p.hiddenTests,
      },
      update: {
        title: p.title,
        difficulty: p.difficulty,
        topic: p.topic,
        status: 'published',
        // Ghi cả khi `false`: nếu chỉ set lúc `create` thì bài đã tồn tại từ
        // lần seed trước (khi chưa có cột `isVip`) sẽ giữ `false` mãi, và
        // "dựng lại DB cho ra 20 bài VIP" sẽ chỉ đúng ở DB mới.
        isVip,
        description: p.description,
        inputFormat: p.inputFormat,
        outputFormat: p.outputFormat,
        constraints: p.constraints,
        examples: p.examples,
        tests: p.tests,
        hiddenTests: p.hiddenTests,
      },
    });
  }
  const count = await db.problem.count();
  const vipCount = await db.problem.count({ where: { isVip: true } });
  if (vipCount !== VIP_PROBLEM_COUNT) {
    throw new Error(
      `Sai số bài VIP: DB có ${vipCount}, quy tắc yêu cầu ${VIP_PROBLEM_COUNT}. ` +
        `Kiểm tra lại ${VIP_SLUGS.length} slug trong quy tắc.`,
    );
  }
  console.log(`Seeded ${count} problems (${vipCount} bài VIP)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
