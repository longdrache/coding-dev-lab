import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Tắt limiter toàn cục 100 req/phút của `app.module.ts`. Cả suite bắn hàng
    // trăm request trong vài giây từ cùng một IP, nên giữ limiter là các test
    // bắn 429 thay vì kiểm tra hành vi thật — đặc biệt các test bài VIP, nơi
    // 403 mới là kết quả đang cần chứng minh. Biến này **chỉ** có tác dụng với
    // e2e; production không đọc nó.
    env: { 
      DISABLE_RATE_LIMIT: '1', 
      DATABASE_URL:'postgresql://postgres:postgres@localhost:55432/gocode'
    },
    /**
     * Cùng phạm vi đo với `vitest.config.ts`: đây là **lần chạy khác**, nên số
     * coverage của nó khác hẳn lần unit — không dùng chung một ngưỡng để gọi là
     * "backend đạt mấy phần trăm".
     */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.d.ts', 'src/generated/**', 'src/main.ts'],
    },
  },
});
