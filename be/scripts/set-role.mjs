// Đặt role/gói VIP cho một user. Role lưu trong bảng `User` (không còn metadata
// ở nhà cung cấp danh tính ngoài), nên script UPDATE thẳng Postgres.
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const rawId = process.argv[2];
const role = process.argv[3] || 'vip';
const plan = process.argv[4] || 'monthly';

if (!rawId) {
  console.log('📌 Cách sử dụng:');
  console.log('   node scripts/set-role.mjs <userId> [role=vip] [plan=monthly]');
  console.log('Ví dụ:');
  console.log('   node scripts/set-role.mjs 12 vip monthly');
  process.exit(1);
}

const userId = Number(rawId);
if (!Number.isInteger(userId)) {
  console.error(`❌ Lỗi: userId phải là số (id trong bảng User), nhận "${rawId}"`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ Lỗi: DATABASE_URL chưa được cấu hình trong file .env');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const { rows } = await pool.query(
    `UPDATE "User"
        SET "role" = $1, "premiumPlan" = $2, "updatedAt" = NOW()
      WHERE "id" = $3
      RETURNING "id", "email", "role", "premiumPlan"`,
    [role, plan, userId],
  );
  if (rows.length === 0) {
    console.error(`❌ Không tìm thấy user id=${userId}`);
    process.exit(1);
  }
  const u = rows[0];
  console.log(`✅ Thành công! Đã nâng quyền cho user ${u.email} (id ${u.id}):`);
  console.log(`   - Role: ${u.role}`);
  console.log(`   - Plan: ${u.premiumPlan}`);
} catch (error) {
  console.error('❌ Thất bại khi cập nhật user:', error?.message || error);
  process.exit(1);
} finally {
  await pool.end();
}
