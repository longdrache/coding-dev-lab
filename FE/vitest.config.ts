import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // `lcov` cho SonarQube. Chưa đặt ngưỡng (thresholds): đo trước vài tuần
      // rồi hãy ghim số, kẻo ghim bừa thành rào cản viết test mới.
      reporter: ['text', 'lcov'],
      include: ['lib/**/*.ts', 'app/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
});
