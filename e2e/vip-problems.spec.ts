import { expect, test, type Page } from '@playwright/test';

// Bài VIP ở FE được nhận diện bằng cờ `isVip` BE gửi kèm, còn quyền mở thì lấy
// từ `role` trong `/me`. Hai thứ này đều là dữ liệu mạng nên test này **chặn
// route** thay vì đăng nhập thật: hermetic, không cần tài khoản, không cần
// chạm Stripe, và đổi dữ liệu test được.

const API = 'http://localhost:4000';
/** FE chạy ở cổng này (`playwright.config.ts` → `baseURL`). */
const ORIGIN_FE = 'http://localhost:3000';

/** Bài VIP đầu tiên theo thứ tự slug — ổn định, không phụ thuộc seed thứ tự nào. */
const SLUG_VIP = 'coin-change';
const TEN_VIP = 'Đổi tiền ít xu nhất';
const SLUG_THUONG = 'two-sum';
const TEN_THUONG = 'Hai số có tổng bằng mục tiêu';

/**
 * Header CORS cho response giả.
 *
 * Bắt buộc: FE và BE khác origin, mà `authedFetcher` gọi kèm `credentials`, nên
 * trình duyệt chặn response không có `Access-Control-Allow-Origin` khớp đúng
 * origin + `Allow-Credentials: true`. Thiếu hai header này thì `fetch` **ném**,
 * và trang bài rơi vào nhánh "Không tải được bài toán" — test sẽ đỏ vì lý do
 * hoàn toàn khác với cái nó đang kiểm.
 */
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN_FE,
  'Access-Control-Allow-Credentials': 'true',
  'Content-Type': 'application/json',
} as const;

/** Payload `/me` của `currentSession()` ở `FE/lib/api.ts`. */
function fakeSession(route: import('@playwright/test').Route, role: 'user' | 'vip') {
  return route.fulfill({
    status: 200,
    headers: { ...CORS },
    body: JSON.stringify({
      user: { id: 42, email: 'e2e@gocode.local', name: 'E2E', role, avatarUrl: null },
      expiresIn: 900,
    }),
  });
}

/**
 * Dựng lại payload chi tiết một bài, đủ field để `Workspace` vẽ được.
 *
 * Chỉ dùng cho người VIP: với người thường, request này phải trả 403
 * `problem_vip_only` và bài đó là bằng chứng BE chặn đúng — không giả lập kết quả
 * của chính sách bảo mật.
 */
const NOI_DUNG_BAI_VIP = 'Cho một mảng gồm các đồng xu khác nhau. Tìm số xu ít nhất tạo nên tổng mong muốn.';

function fakeVipProblemDetail(route: import('@playwright/test').Route) {
  return route.fulfill({
    status: 200,
    headers: { ...CORS },
    body: JSON.stringify({
      slug: SLUG_VIP,
      title: TEN_VIP,
      difficulty: 'Trung bình',
      topic: 'dp',
      isVip: true,
      description: NOI_DUNG_BAI_VIP,
      inputFormat: 'Dòng đầu gồm s và n.',
      outputFormat: 'In ra số xu ít nhất.',
      constraints: ['1 ≤ n ≤ 10⁴'],
      examples: [{ input: '11 3\n1 2 5', output: '3' }],
      tests: [{ stdin: '11 3\n1 2 5', expected: '3' }],
    }),
  });
}

/**
 * Lọc danh sách tới đúng một bài.
 *
 * Danh sách phân trang 10 bài/trang, còn bài VIP nằm ở vị trí tuỳ thứ tự seed —
 * tìm trong ô tìm kiếm thay vì đoán vị trí, để test không gắn với thứ tự `createdAt`
 * mà `db.problem.findMany` đang dùng.
 */
async function timBaiTrongDanhSach(page: import('@playwright/test').Page, tuKhoa: string) {
  await page.goto('/problem');
  // `fill` tự chờ phần tử actionable (visible + enabled) nên không cần assert
  // `toBeVisible` trước: assert sớm ở giữa lúc hydration dễ chập chờn, còn kết
  // quả thật của bài tìm kiếm là link mà các test dưới kiểm.
  //
  // `filter({ visible: true })` là bắt buộc, không phải cho đẹp: RSC stream bài
  // trong `<Suspense>` (xem `FE/app/problem/page.tsx`), và React chừa một bản
  // sao trong `<div hidden id="S:0">` cho tới lúc hydrate xong. `getByPlaceholder`
  // khớp theo thuộc tính nên **thấy cả bản ẩn** (`display:none`, 0×0 nhưng
  // `isConnected`), đủ để Playwright báo strict mode violation "resolved to 2
  // elements" và hỏng cả test. Lọc theo visibility thì đúng một cái, và `fill`
  // vẫn tự chờ nên lúc chỉ có bản ẩn thì không sao.
  await page.getByPlaceholder(/Tìm kiếm bài tập/).filter({ visible: true }).fill(tuKhoa);
}

test.describe('bài VIP: khách thấy tiêu đề kèm dấu khoá trong danh sách', () => {
  test('bài VIP hiện tiêu đề kèm nhãn VIP, bài thường thì không', async ({ page }) => {
    await timBaiTrongDanhSach(page, 'Đổi tiền');
    const vip = page.getByRole('link', { name: new RegExp(TEN_VIP) }).first();
    await expect(vip).toBeVisible();
    await expect(vip.getByText('VIP', { exact: true })).toBeVisible();

    await timBaiTrongDanhSach(page, 'Hai số có tổng');
    const thuong = page.getByRole('link', { name: new RegExp(TEN_THUONG) }).first();
    await expect(thuong).toBeVisible();
    await expect(thuong.getByText('VIP', { exact: true })).toHaveCount(0);
  });
});

test.describe('bài VIP: mở ra thì bị chặn, có nút nâng cấp', () => {
  test('khách bấm bài VIP thấy màn khoá, không thấy đề bài', async ({ page }) => {
    await page.goto(`/problem/${SLUG_VIP}`);

    await expect(page.getByRole('heading', { name: new RegExp(TEN_VIP) })).toBeVisible({
      timeout: 60_000,
    });
    // Nút nâng cấp phải dẫn tới trang bảng giá, không phải slug bài ghép vào URL.
    const nangCap = page.getByRole('link', { name: /Nâng cấp/ });
    await expect(nangCap).toBeVisible();
    await expect(nangCap).toHaveAttribute('href', '/premium');

    // Quan trọng nhất: **không** có mô tả bài nào lọt ra màn này.
    await expect(page.getByText(NOI_DUNG_BAI_VIP)).toHaveCount(0);
    await expect(page.locator('#editor')).toHaveCount(0);
  });

  test('màn khoá hiện cả tiêu đề bài lẫn lối về danh sách', async ({ page }) => {
    await page.goto(`/problem/${SLUG_VIP}`);
    await expect(page.getByRole('link', { name: /Về danh sách bài/ })).toBeVisible({
      timeout: 60_000,
    });
  });
});

test.describe('bài VIP: người có VIP vào bài bình thường', () => {
  test.beforeEach(async ({ page }) => {
    // Giả `/me` trả role vip, và giả chi tiết bài trả 200 — đúng những gì BE
    // thật trả cho người có VIP.
    await page.route(`${API}/api/auth/me`, (route) => fakeSession(route, 'vip'));
    await page.route(`${API}/api/problems/${SLUG_VIP}`, (route) => fakeVipProblemDetail(route));
  });

  test('vào bài VIP thì có đề bài, không có màn khoá', async ({ page }) => {
    await page.goto(`/problem/${SLUG_VIP}`);

    /**
     * Bấm "Thử lại" nếu màn lỗi hiện ra.
     *
     * Đây là lỗi **có sẵn từ trước**, không phải do bài VIP: `AuthProvider`
     * xoá sạch cache SWR ngay lần `/me` đầu tiên trả về (`applyUser` →
     * `commitSession` với `prev === null`), nên request chi tiết bài vừa về thì
     * bị xoá mất. Đã kiểm lại bằng `git stash` trên base commit: bài **thường**
     * (`/problem/two-sum`) cũng rơi vào đúng màn này khi đã đăng nhập. Bấm thử
     * lại là cách vượt qua để kiểm tra phần **bài VIP**, không phải để né lỗi:
     * assert bên dưới là "có đề bài và không có màn khoá", đúng những gì test này
     * cần biết. Lỗi gốc ghi ở `vip-problems-report.md`, chưa sửa vì ngoài phạm vi.
     */
    const thuLai = page.getByRole('button', { name: /Thử lại/ });
    const noiDung = page.getByText(NOI_DUNG_BAI_VIP);
    // Chờ **một trong hai** xuất hiện rồi mới quyết định, thay vì dò ngay sau
    // `goto`: lúc đó trang còn ở skeleton nên `.count()` trả 0 và nút không bao
    // giờ được bấm — đó chính là lý do test này chập chờn.
    await expect(thuLai.or(noiDung).first()).toBeVisible({ timeout: 60_000 });
    if (await thuLai.count()) await thuLai.click();

    await expect(noiDung).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: /Nâng cấp/ })).toHaveCount(0);
  });

  test('danh sách không hiện dấu khoá cho người VIP', async ({ page }) => {
    await timBaiTrongDanhSach(page, 'Đổi tiền');
    const vip = page.getByRole('link', { name: new RegExp(TEN_VIP) }).first();
    await expect(vip).toBeVisible();
    await expect(vip.getByText('VIP', { exact: true })).toHaveCount(0);
  });
});

test.describe('bài VIP: người đã đăng nhập nhưng không VIP', () => {
  test('bị chặn y hệt khách — role user trong token không mở được bài VIP', async ({ page }: { page: Page }) => {
    await page.route(`${API}/api/auth/me`, (route) => fakeSession(route, 'user'));
    await page.goto(`/problem/${SLUG_VIP}`);

    await expect(page.getByRole('link', { name: /Nâng cấp/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(NOI_DUNG_BAI_VIP)).toHaveCount(0);
  });
});
