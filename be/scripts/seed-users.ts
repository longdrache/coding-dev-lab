import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const users = [
  {
    email: 'user@gocode.local',
    name: 'Test User',
    password: 'password123',
    role: 'user',
  },
  {
    email: 'vip@gocode.local',
    name: 'VIP User',
    password: 'password123',
    role: 'vip',
    vipExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
  {
    email: 'admin@gocode.local',
    name: 'Admin User',
    password: 'password123',
    role: 'admin',
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
