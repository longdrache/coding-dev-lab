import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  use: { baseURL: 'http://localhost:3000' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // Suite phải tự đứng vững. Không có `webServer` thì test chỉ xanh khi ai đó
  // đang chạy `pnpm dev` thủ công, và đỏ im lặng khi không — đó là nguyên nhân
  // khiến smoke test đỏ trong khi ba app đều build sạch.
});
