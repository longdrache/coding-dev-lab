import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:4000';

type FakeUser = {
  id: number;
  email: string;
  name: string | null;
  role: 'user' | 'vip' | 'admin';
  avatarUrl: string | null;
  password: string;
};

const USER: FakeUser = {
  id: 1,
  email: 'user@gocode.local',
  name: 'E2E User',
  role: 'user',
  avatarUrl: null,
  password: 'password123',
};
const VIP_USER: FakeUser = {
  id: 2,
  email: 'vip@gocode.local',
  name: 'VIP User',
  role: 'vip',
  avatarUrl: null,
  password: 'password123',
};
async function signIn(page: Page, user: FakeUser) {
  const loginRes = await page.context().request.post(`${API}/api/auth/login`, {
    data: { email: user.email, password: user.password },
  });
  console.log(loginRes.status());
  expect(loginRes.ok()).toBeTruthy();
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === 'session');
  const refreshCookie = cookies.find((c) => c.name === 'refresh');
  expect(sessionCookie).toBeTruthy();
  expect(refreshCookie).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Tài khoản:/ })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('Luồng đầy đủ: đăng nhập → duyệt → nộp bài → dashboard', () => {
  test('duyệt danh sách bài tập', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem');
    await expect(page.getByRole('link', { name: /Hai số có tổng/ }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('mở bài tập thường và xem đề bài', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem/two-sum');

    const thuLai = page.getByRole('button', { name: /Thử lại/ });
    const noiDung = page.getByRole('heading', { name: /Hai số có tổng/ });
    // Chờ **một trong hai** xuất hiện rồi mới quyết định, thay vì dò ngay sau
    // `goto`: lúc đó trang còn ở skeleton nên `.count()` trả 0 và nút không bao
    // giờ được bấm — đó chính là lý do test này chập chờn.
    await expect(thuLai.or(noiDung).first()).toBeVisible({ timeout: 60_000 });
    if (await thuLai.count()) await thuLai.click();
    await expect(page.locator('#editor')).toBeVisible();
  });

  test('bài VIP bị khoá với tài khoản thường', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem/merge-intervals');

    await expect(page.getByRole('heading', { name: /GoCode Premium/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#editor')).toHaveCount(0);
  });

  test('nộp bài và xem kết quả', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem/two-sum');
    const thuLai = page.getByRole('button', { name: /Thử lại/ });
    if (await thuLai.count()) await thuLai.click();
    await expect(page.locator('#editor')).toBeVisible({ timeout: 30_000 });

    const submitBtn = page.getByRole('button', { name: /Nộp bài/ });
    await expect(submitBtn).toBeVisible();

    await page.locator('#editor').click();
    // await page.keyboard.press('Control+A');
    await page.keyboard.type(
      'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []',
    );

    const resultPromise = page.waitForResponse((r) => r.url().includes('/api/problems/') && r.status() === 201);
    await submitBtn.click();
    await resultPromise;
    await expect(page.getByText(/Kết quả|Đúng|Sai/).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test('xem lịch sử nộp bài', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem/two-sum');

    await expect(page.locator('#editor')).toBeVisible({ timeout: 30_000 });

    const historyTab = page.getByRole('tab', { name: /Lịch sử/ });
    if (await historyTab.count()) {
      await historyTab.click();
      await expect(page.getByText(/Lịch sử nộp/).first()).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test('xem dashboard tiến độ', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/');

    const dashboardLink = page.getByRole('link', { name: /Tiến độ/ });
    if (await dashboardLink.count()) {
      await dashboardLink.click();
      await expect(page.getByText(/Chuỗi|Tiến độ/).first()).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test('xem trang premium', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/premium');
    await expect(page.getByText(/1 Tháng/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1 Năm/).first()).toBeVisible();
  });

  test('đăng xuất', async ({ page }) => {
    await signIn(page, USER);
    const avatarBtn = page.getByRole('button', { name: /^Tài khoản:/ });
    await avatarBtn.click();
    await page.getByRole('menuitem', { name: /Đăng xuất/ }).click();
    await expect(page.getByRole('link', { name: /Đăng nhập/ }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe('Luồng VIP: người dùng premium truy cập bài VIP', () => {
  test('VIP truy cập bài VIP', async ({ page }) => {
    await signIn(page, VIP_USER);
    await page.goto('/problem/coin-change');
    const thuLai = page.getByRole('button', { name: /Thử lại/ });
    const noiDung = page.getByRole('heading', { name: /Đổi tiền ít xu nhất/ });
    // Chờ **một trong hai** xuất hiện rồi mới quyết định, thay vì dò ngay sau
    // `goto`: lúc đó trang còn ở skeleton nên `.count()` trả 0 và nút không bao
    // giờ được bấm — đó chính là lý do test này chập chờn.
    await expect(thuLai.or(noiDung).first()).toBeVisible({ timeout: 60_000 });
    if (await thuLai.count()) await thuLai.click();
    await expect(page.locator('#editor')).toBeVisible();
  });

  test('VIP không thấy nút nâng cấp', async ({ page }) => {
    await signIn(page, VIP_USER);
    await page.goto('/problem/coin-change');
    await expect(page.getByRole('link', { name: /Nâng cấp/ })).toHaveCount(0);
  });
});
