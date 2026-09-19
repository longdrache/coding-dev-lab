import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { PrismaPg } from '@prisma/adapter-pg';
const keep = ["two-sum","valid-palindrome","first-unique-char","valid-parentheses","binary-search","climbing-stairs","remove-duplicates","kth-largest","merge-intervals","number-of-islands","sum-array","find-max","reverse-array","count-vowels","count-even","sort-array","factorial","reverse-string","missing-number","check-anagram"];
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })});
async function main(){
  const all = await db.problem.findMany({select:{slug:true}});
  console.log("before", all.length);
  const toDel = all.filter(p=>!keep.includes(p.slug)).map(p=>p.slug);
  console.log("toDel", toDel.length, toDel.slice(0,3));
  if(toDel.length){
    const r = await db.problem.deleteMany({where:{slug:{in:toDel}}});
    console.log("deleted", r.count);
    const s = await db.submission.deleteMany({where:{problemSlug:{in:toDel}}});
    console.log("subs deleted", s.count);
  }
  console.log("after", await db.problem.count());
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());
