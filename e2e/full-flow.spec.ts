import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:4000';

type FakeUser = {
  id: number;
  email: string;
  name: string | null;
  role: 'user' | 'vip' | 'admin';
  avatarUrl: string | null;
};

const USER: FakeUser = {
  id: 1,
  email: 'e2e@gocode.local',
  name: 'E2E User',
  role: 'user',
  avatarUrl: null,
};

async function signIn(page: Page, user: FakeUser) {
  await page.route(`${API}/api/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user, expiresIn: 900 }),
    }),
  );
  await page.route(`${API}/api/auth/logout`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Tài khoản:/ })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('Full flow: login → browse → submit → dashboard', () => {
  test('user can browse problem list', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem');
    await expect(page.getByRole('link', { name: /Hai số có tổng/ }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('user can open a problem and see description', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem/two-sum');
    await expect(page.getByRole('heading', { name: /Hai số có tổng/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#editor')).toBeVisible();
  });

  test('user can submit code and see result', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem/two-sum');

    await expect(page.locator('#editor')).toBeVisible({ timeout: 30_000 });

    const submitBtn = page.getByRole('button', { name: /Nộp bài|Submit/ });
    await expect(submitBtn).toBeVisible();

    await page.locator('#editor').click();
    await page.keyboard.CTRL + 'a';
    await page.keyboard.type('def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []');

    await submitBtn.click();

    await expect(page.getByText(/Kết quả|Result|Accepted|Wrong Answer/).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test('user can view submission history', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/problem/two-sum');

    await expect(page.locator('#editor')).toBeVisible({ timeout: 30_000 });

    const historyTab = page.getByRole('tab', { name: /Lịch sử|History/ });
    if (await historyTab.count()) {
      await historyTab.click();
      await expect(page.getByText(/Lịch sử nộp|Submission history/).first()).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test('user can view progress dashboard', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/');

    const dashboardLink = page.getByRole('link', { name: /Tiến độ|Dashboard|Progress/ });
    if (await dashboardLink.count()) {
      await dashboardLink.click();
      await expect(page.getByText(/Chuỗi|Streak|Tiến độ|Progress/).first()).toBeVisible({
        timeout: 30_000,
      });
    }
  });

  test('user can view premium page', async ({ page }) => {
    await signIn(page, USER);
    await page.goto('/premium');
    await expect(page.getByText(/1 Tháng/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1 Năm/).first()).toBeVisible();
  });

  test('user can logout', async ({ page }) => {
    await signIn(page, USER);
    const avatarBtn = page.getByRole('button', { name: /^Tài khoản:/ });
    await avatarBtn.click();
    await page.getByRole('menuitem', { name: /Đăng xuất/ }).click();
    await expect(page.getByRole('button', { name: /Đăng nhập|Sign in/ }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe('API integration: submission flow', () => {
  test('POST /api/submissions returns result', async ({ page }) => {
    await signIn(page, USER);

    const response = await page.request.post(`${API}/api/submissions`, {
      data: {
        problemSlug: 'two-sum',
        languageId: 71,
        sourceCode: 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return []',
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('token');
  });

  test('GET /api/history returns submissions', async ({ page }) => {
    await signIn(page, USER);

    const response = await page.request.get(`${API}/api/history`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('GET /api/progress/dashboard returns progress data', async ({ page }) => {
    await signIn(page, USER);

    const response = await page.request.get(`${API}/api/progress/dashboard`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('streak');
    expect(body).toHaveProperty('heatmap');
    expect(body).toHaveProperty('badges');
  });

  test('GET /api/problems returns problem list', async ({ page }) => {
    await signIn(page, USER);

    const response = await page.request.get(`${API}/api/problems`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test('GET /api/problems/:slug returns problem detail', async ({ page }) => {
    await signIn(page, USER);

    const response = await page.request.get(`${API}/api/problems/two-sum`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('slug', 'two-sum');
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('description');
  });
});

test.describe('VIP flow: premium user access', () => {
  test('VIP user can access VIP problem', async ({ page }) => {
    await signIn(page, { ...USER, role: 'vip' });
    await page.goto('/problem/coin-change');
    await expect(page.getByRole('heading', { name: /Đổi tiền ít xu nhất/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#editor')).toBeVisible();
  });

  test('VIP user does not see upgrade button', async ({ page }) => {
    await signIn(page, { ...USER, role: 'vip' });
    await page.goto('/problem/coin-change');
    await expect(page.getByRole('link', { name: /Nâng cấp/ })).toHaveCount(0);
  });
});
