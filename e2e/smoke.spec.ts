import { expect, test } from '@playwright/test';

// Trước đây không test `/` vì route render client-side trong ClerkProvider và
// ClerkJS không init được ở headless. Clerk đã gỡ trọn vẹn nên `/` phải render
// được — đó đúng là lỗi từng làm hỏng app ("useUser can only be used within
// the <ClerkProvider />") nên phải có test canh.

test('landing render tiêu đề', async ({ page }) => {
  await page.goto('/');
  // "RÈN TƯ DUY GIẢI THUẬT" xuất hiện ở CẢ loader lẫn hero nên bắt buộc
  // .first(), nếu không Playwright báo strict mode violation.
  await expect(page.getByText('RÈN TƯ DUY GIẢI THUẬT').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('main').first()).toBeVisible();
});

test('landing không có lỗi JavaScript', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/');
  await page.waitForTimeout(6000);
  expect(errs, `lỗi JS khi render landing: ${errs.join(' | ')}`).toEqual([]);
});

// id thật lấy từ `FE/app/ui/AuthForm.tsx` và `FE/app/forgot-password/page.tsx`.
// Đo thật cho thấy form render đầy đủ, nhưng cần vài giây sau khi điều hướng.
for (const route of ['/sign-in', '/sign-up']) {
  test(`${route} hiện form đăng nhập`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('#auth-email')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#auth-password')).toBeVisible();
  });
}

test('/forgot-password hiện form quên mật khẩu', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.locator('#forgot-email')).toBeVisible({ timeout: 60_000 });
});

test('/problem hiện danh sách bài', async ({ page }) => {
  await page.goto('/problem');
  // SSR trả sẵn data: bảng có dòng bài đầu tiên
  await expect(page.getByRole('link', { name: /Hai số có tổng/ }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test('URL lạ hiện trang 404', async ({ page }) => {
  await page.goto('/xyz-khong-ton-tai-123');
  await expect(page.getByText('404', { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test('/premium hiện 3 gói giá', async ({ page }) => {
  await page.goto('/premium');
  await expect(page.getByText(/Hàng Tháng/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Hàng Năm/).first()).toBeVisible();
});
