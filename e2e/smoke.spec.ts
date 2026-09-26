import { expect, test } from '@playwright/test';

// Lưu ý: route `/` render client-side trong ClerkProvider, mà ClerkJS không
// init được ở headless (third-party cookies) nên không test `/` tại đây —
// browser thật vẫn chạy. Các route SSR bên dưới test được đầy đủ.

test('/problem hiện danh sách bài', async ({ page }) => {
  await page.goto('/problem');
  // SSR trả sẵn data: bảng có dòng bài đầu tiên
  await expect(page.getByRole('link', { name: /Hai số có tổng/ }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test('URL lạ hiện trang 404', async ({ page }) => {
  await page.goto('/xyz-khong-ton-tai-123');
  await expect(page.getByText('404', { exact: false }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test('/premium hiện 3 gói giá', async ({ page }) => {
  await page.goto('/premium');
  await expect(page.getByText(/Hàng Tháng/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Hàng Năm/).first()).toBeVisible();
});
