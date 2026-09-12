import { createClerkClient } from '@clerk/backend';

const userId = process.argv[2];
const role = process.argv[3] || 'vip';
const plan = process.argv[4] || 'monthly';
import dotenv from 'dotenv';
dotenv.config();

if (!userId) {
  console.log('📌 Cách sử dụng:');
  console.log(
    '   node scripts/set-role.mjs <userId> [role=vip] [plan=monthly]',
  );
  console.log('Ví dụ:');
  console.log('   node scripts/set-role.mjs user_2tX... vip monthly');
  process.exit(1);
}

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error('❌ Lỗi: CLERK_SECRET_KEY chưa được cấu hình trong file .env');
  process.exit(1);
}

const clerk = createClerkClient({ secretKey });

try {
  const updatedUser = await clerk.users.updateUserMetadata(userId, {
    publicMetadata: {
      role,
      premiumPlan: plan,
    },
  });

  console.log(`✅ Thành công! Đã nâng quyền cho user ${userId}:`);
  console.log(`   - Role: ${updatedUser.publicMetadata.role}`);
  console.log(`   - Plan: ${updatedUser.publicMetadata.premiumPlan}`);
} catch (error) {
  console.error(
    '❌ Thất bại khi cập nhật user metadata:',
    error?.message || error,
  );
  process.exit(1);
}
