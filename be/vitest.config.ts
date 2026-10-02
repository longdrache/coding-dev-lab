import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      /**
       * Chỉ đo code của backend. File test loại vì chính nó là test, còn
       * `src/generated` là client Prisma sinh máy — đo nó làm tụt % vì thứ không ai
       * viết tay, không phải vì thiếu test.
       */
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.spec.ts',
        '**/*.d.ts',
        'src/generated/**',
        // Điểm khởi động: chỉ dựng app + bắt lỗi toàn cục. Chạy được nhờ e2e, không
        // có logic để unit test.
        'src/main.ts',
      ],
      /**
       * Ngưỡng **chỉ** cho lần chạy unit này.
       *
       * Số đo lúc đặt: lines 86.4%, branches 75.8% — nên `80`/`75` là ngưỡng mà
       * code hiện tại vượt qua, chứ không phải ngưỡng hạ xuống để làm xanh. Muốn
       * siết `lines` lên 90% thì phải viết thêm test, không sửa con số ở đây.
       *
       * Không dùng `perFile`: nhiều file ở đây là glue mỏng đúng nghĩa
       * (`cors.ts`, `main.ts`) hoặc service lớn chưa test tới (`admin.service.ts`
       * ~44%), nên ngưỡng mỗi-file sẽ đỏ vì lý do hình thức chứ không phải vì
       * thứ gì đang hỏng. Ngưỡng toàn cục là cái hợp đồng thật sự ở đây.
       *
       * Chỉ `pnpm test:cov` chạy bước này — `pnpm test` giữ nguyên nhanh.
       */
      thresholds: {
        lines: 80,
        branches: 75,
      },
    },
  },
});
