import { expect, test } from '@playwright/test';

// `/` trước đây không được test vì route render client-side và bọc hook auth của
// bên thứ ba nên không khởi tạo được ở headless. Auth tự quản lý đã thay thế
// nên `/` phải render được — đó đúng là lỗi từng làm hỏng trang chủ, nên phải
// có test canh.

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

// Link xác nhận trong mail trỏ tới `/sign-up?token=…`. Trước đó không ai đọc
// `token`: bấm link chỉ ra lại form đăng ký, nên người dùng đăng ký xong bấm link
// vẫn không vào được — đúng triệu chứng báo. Test này canh đúng chỗ đó.
test('/sign-up?token=… không rơi về form đăng ký mà hiện màn xác nhận', async ({ page }) => {
  await page.goto('/sign-up?token=ma-khong-ton-tai');
  // H1 vẫn là của trang đăng ký (AuthShell giữ nguyên), nên phải canh **bên
  // trong thẻ**: màn xác nhận thay thế form, không phải thêm bên dưới form.
  await expect(page.getByText('Link này không dùng được nữa')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#auth-email')).toHaveCount(0);
  await expect(page.locator('#auth-password')).toHaveCount(0);
  // Lối thoát phải có: không thì người dùng bị kẹt ở một màn báo lỗi.
  await expect(page.getByRole('link', { name: /Đăng nhập/ }).first()).toBeVisible();
});

test('/forgot-password hiện form quên mật khẩu', async ({ page }) => {
  await page.goto('/forgot-password');
  await expect(page.locator('#forgot-email')).toBeVisible({ timeout: 60_000 });
});

// Khi vòng OAuth Google hỏng, BE `302` về `/sign-in?oauth=<mã>`
// (`auth.controller.ts:386,390,397,401,404,409,413,423`). Trước khi có Task 5 thì
// người dùng quay lại đúng trang đăng nhập và thấy… một form bình thường, không
// có dòng nào giải thích vì sao mình không vào được. Test này canh đúng chỗ đó.
test('/sign-in?oauth=… hiện nút Google và câu báo theo mã BE', async ({ page }) => {
  await page.goto('/sign-in?oauth=exists');
  // `exists` là mã quan trọng nhất: phải chỉ đúng việc phải làm là đăng nhập
  // bằng mật khẩu trước, không thì người dùng bấm Google lại mãi.
  await expect(page.getByTestId('google-signin')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Đăng nhập bằng mật khẩu/)).toBeVisible();
});

// `conflict` là mã dễ rơi nhất (sinh ở tầng service, không ở controller) và là
// mã mà im lặng thì tệ nhất: nó chỉ xảy ra khi người dùng **đang đăng nhập** mà
// tài khoản Google thuộc về user khác, nên bấm lại Google là lặp vô hạn.
test('/sign-in?oauth=conflict nói rõ không phải lỗi của người dùng và bảo đăng xuất', async ({
  page,
}) => {
  await page.goto('/sign-in?oauth=conflict');
  const note = page.getByText(/không phải lỗi của bạn/);
  await expect(note).toBeVisible({ timeout: 60_000 });
  await expect(note).toContainText('đăng xuất');
  // Câu bắt họ "thử lại" là sai: giữ nguyên phiên đăng nhập thì BE trả lại
  // đúng mã này lần nữa.
  await expect(note).not.toContainText(/thử lại/i);
});

// Mã lạ do người dùng gõ tay: không được in chữ "undefined" ra giữa thẻ.
test('/sign-in?oauth=<mã lạ> không in undefined ra màn hình', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('/sign-in?oauth=ma-khong-ton-tai');
  await expect(page.getByTestId('google-signin')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('undefined')).toHaveCount(0);
  expect(errs, `lỗi JS khi render màn đăng nhập: ${errs.join(' | ')}`).toEqual([]);
});

test('/sign-in vẫn hiện nút Google khi không có lỗi OAuth nào', async ({ page }) => {
  await page.goto('/sign-in');
  const btn = page.getByTestId('google-signin');
  await expect(btn).toBeVisible({ timeout: 60_000 });
  // `href` phải trỏ thẳng route start của BE kèm `redirect_to` an toàn.
  await expect(btn).toHaveAttribute(
    'href',
    /\/api\/auth\/oauth\/google\/start\?redirect_to=%2F$/,
  );
  await expect(btn).toHaveRole('link');
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
