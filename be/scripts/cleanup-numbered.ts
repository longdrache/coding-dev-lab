import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';

const keep = [
  "two-sum",
  "valid-palindrome",
  "first-unique-char",
  "valid-parentheses",
  "binary-search",
  "climbing-stairs",
  "remove-duplicates",
  "kth-largest",
  "merge-intervals",
  "number-of-islands",
];

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const all = await db.problem.findMany({ select: { slug: true } });
  console.log("before", all.length, all.map(a=>a.slug).slice(0,5));
  const toDelete = all.filter(p => !keep.includes(p.slug)).map(p=>p.slug);
  console.log("toDelete", toDelete.length, toDelete.slice(0,5));
  if (toDelete.length) {
    const res = await db.problem.deleteMany({ where: { slug: { in: toDelete } } });
    console.log("deleted", res.count);
  }
  // also clean submissions for deleted slugs?
  const subDel = await db.submission.deleteMany({ where: { problemSlug: { in: toDelete } } });
  console.log("submissions deleted", subDel.count);
  const after = await db.problem.count();
  console.log("after", after);
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());
