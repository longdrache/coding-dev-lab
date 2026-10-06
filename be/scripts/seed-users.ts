import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import * as bcrypt from 'bcryptjs';
import 'dotenv/config';
const prisma = new PrismaClient({
  adapter: new PrismaPg({  connectionString: process.env.USE_DATABASE_TEST === '1'
        ? process.env.DATABASE_TEST_URL
        : process.env.DATABASE_URL}),
});

const users = [
  {
    email: 'user@gocode.local',
    name: 'Test User',
    password: 'password123',
    role: 'user',
    emailVerifiedAt: new Date(),
  },
  {
    email: 'vip@gocode.local',
    name: 'VIP User',
    password: 'password123',
    role: 'vip',
    emailVerifiedAt: new Date(),
    vipExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
];

async function main() {
  console.log('Seeding users...');

  for (const userData of users) {
    const { password, ...rest } = userData;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: { ...rest, passwordHash },
      create: { ...rest, passwordHash },
    });

    console.log(`Created/Updated user: ${user.email} (role: ${user.role})`);
  }

  console.log('User seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
