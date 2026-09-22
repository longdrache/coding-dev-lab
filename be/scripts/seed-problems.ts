import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
import { problems } from '../../FE/app/data/problems.ts';

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  for (const p of problems) {
    await db.problem.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        topic: p.topic,
        status: 'published',
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
  console.log(`Seeded ${count} problems`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
