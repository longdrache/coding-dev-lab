import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Suite integration: service thật + Postgres thật (`be/test/db-integration.ts`
 * giữ kết nối, chặn Neon, dọn bảng mỗi test).
 *
 * Cố ý TÁCH khỏi `vitest.config.ts` (unit, `**\/*.spec.ts`):
 * - Unit phải chạy được không cần DB — file ở đây KHÔNG match `*.spec.ts`
 *   nên hai suite không bao giờ lẫn nhau.
 * - Cố ý KHÔNG `dotenv.config()` đọc `.env`: `be/.env` trỏ Neon production.
 *   URL tới từ shell (`DATABASE_URL=... pnpm test:integration`), thiếu là chết
 *   ngay với câu hướng dẫn chứ không lặng lẽ dùng DB khác.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.integration.ts'],
    // Hai file trở lên chung một DB test: chạy song song file thì
    // `beforeEach` truncate của file này xoá dữ liệu file kia đang dùng giữa
    // chừng. Chạy tuần tự — suite vẫn tính bằng giây, không đáng đánh đổi.
    fileParallelism: false,
    // bcrypt thật + DB thật chậm hơn RAM nhiều — 120s cho cả test nặng nhất
    // (11 lần login trong test trim phiên).
    testTimeout: 120_000,
    env:{
      DATABASE_URL:'postgresql://postgres:postgres@localhost:55432/gocode'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.integration.ts', '**/*.d.ts', 'src/generated/**', 'src/main.ts'],
    },
  },
});
