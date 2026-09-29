import { expect, test, type Page } from "@playwright/test";

/*
 * Menu tài khoản ở header, kiểm thật trên DOM.
 *
 * Không đăng nhập thật: `/sign-up` bắt xác nhận qua email nên không tạo được phiên
 * trong CI. Thay vào đó chặn `GET /api/auth/me` và trả về một user giả — đủ để
 * `AuthProvider` đi hết đường vào nhánh "đã đăng nhập" mà không cần tài khoản thật,
 * cũng không ghi gì vào database.
 *
 * User giả **cố tình đặt `name: null`** vì đó đúng là trạng thái thật của
 * tài khoản Google không đặt tên hiển thị (`auth.service.ts:720` lưu
 * `raw.name ?? null`), và đó là nguyên nhân gốc của ký tự avatar vỡ.
 */

const API = "http://localhost:4000";

type FakeUser = {
  id: number;
  email: string;
  name: string | null;
  role: "user" | "vip" | "admin";
  avatarUrl: string | null;
};

const GOOGLE_USER: FakeUser = {
  id: 2,
  email: "inhlongnguyen@gmail.com",
  name: null,
  role: "vip",
  avatarUrl: null,
};

async function signIn(page: Page, user: FakeUser) {
  await page.route(`${API}/api/auth/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user, expiresIn: 900 }),
    }),
  );
  await page.route(`${API}/api/auth/logout`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/");
  // Header đã đăng nhập chỉ hiện sau khi `mounted` và lần đọc `/me` đầu tiên xong.
  await expect(page.getByRole("button", { name: /^Tài khoản:/ })).toBeVisible({
    timeout: 60_000,
  });
}

const avatarButton = (page: Page) => page.getByRole("button", { name: /^Tài khoản:/ });

test("avatar KHÔNG hiện chữ cái đầu của email khi name rỗng", async ({ page }) => {
  await signIn(page, GOOGLE_USER);
  const btn = avatarButton(page);

  // Lỗi gốc: chuỗi cũ rơi xuống lấy `charAt(0)` của email => "I", một nét dọc trông
  // như ký tự vỡ. Nay phải là dấu hỏi tường minh.
  await expect(btn).toHaveText("?");
  await expect(btn).not.toHaveText("I");
});

test("lời chào lấy phần trước @ chứ không dùng cả email", async ({ page }) => {
  await signIn(page, GOOGLE_USER);
  await expect(page.getByText("Xin chào, inhlongnguyen!")).toBeVisible();
  // Không được tràn cả email đầy đủ — đó là lỗi báo lại.
  await expect(page.getByText("inhlongnguyen@gmail.com!", { exact: false })).toHaveCount(0);
});

test("có name thì lời chào dùng tên, không dùng email", async ({ page }) => {
  await signIn(page, { ...GOOGLE_USER, name: "Long Nguyen" });
  await expect(page.getByText("Xin chào, Long Nguyen!")).toBeVisible();
  // Avatar cũng phải theo tên.
  await expect(avatarButton(page)).toHaveText("L");
});

test("avatarUrl hợp lệ thì hiện <img> kèm referrerPolicy no-referrer", async ({ page }) => {
  const src = "https://lh3.googleusercontent.com/a/ACg8oc-avatar=w96-h96";
  await signIn(page, { ...GOOGLE_USER, name: "Long Nguyen", avatarUrl: src });
  const img = page.locator(`img[src="${src}"]`);
  await expect(img).toBeVisible();
  // Google trả 403 cho một số ảnh lh3 khi Referer là domain khác.
  await expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(img).toHaveAttribute("alt", "");
});

test("avatarUrl sai scheme thì rơi về chữ cái, không vỡ ảnh", async ({ page }) => {
  await signIn(page, { ...GOOGLE_USER, name: "Long Nguyen", avatarUrl: "javascript:alert(1)" });
  await expect(avatarButton(page)).toHaveText("L");
  await expect(page.locator("img[src^='javascript']")).toHaveCount(0);
});

test("bấm avatar mở menu, bấm lần hai đóng", async ({ page }) => {
  await signIn(page, GOOGLE_USER);
  const btn = avatarButton(page);

  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("menu")).toHaveCount(0);

  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menu")).toBeVisible();

  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("nút avatar khai đúng ngữ nghĩa menu", async ({ page }) => {
  // `role: "user"` mới có mục "Nâng cấp lên VIP" — `GOOGLE_USER` là VIP nên không.
  await signIn(page, { ...GOOGLE_USER, role: "user" });
  const btn = avatarButton(page);
  await expect(btn).toHaveAttribute("aria-haspopup", "menu");
  await expect(btn).toHaveAttribute("aria-controls", /.+/);

  await btn.click();
  await expect(page.getByRole("menu")).toHaveAttribute("aria-label", "Tài khoản");
  await expect(page.getByRole("menuitem", { name: /Nâng cấp lên VIP/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Đăng xuất/ })).toBeVisible();
});

test("VIP không thấy mục nâng cấp", async ({ page }) => {
  await signIn(page, { ...GOOGLE_USER, role: "user" });
  await avatarButton(page).click();
  await expect(page.getByRole("menuitem", { name: /Nâng cấp lên VIP/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Đăng xuất/ })).toBeVisible();

  // Lần này role là vip: mục nâng cấp phải biến mất.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await signIn(page, GOOGLE_USER);
  await avatarButton(page).click();
  await expect(page.getByRole("menuitem", { name: /Nâng cấp lên VIP/ })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: /Đăng xuất/ })).toBeVisible();
});

test("Escape đóng menu và trả focus về nút avatar", async ({ page }) => {
  await signIn(page, GOOGLE_USER);
  const btn = avatarButton(page);

  await btn.click();
  await expect(page.getByRole("menu")).toBeVisible();
  // Mở menu thì focus phải vào mục đầu, không nằm lại trên nút avatar.
  await expect(page.getByRole("menuitem").first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(btn).toBeFocused();
});

test("bấm ra ngoài thì đóng menu", async ({ page }) => {
  await signIn(page, GOOGLE_USER);
  const btn = avatarButton(page);

  await btn.click();
  await expect(page.getByRole("menu")).toBeVisible();

  // Bấm vào lời chào: cùng header nhưng ngoài vùng dropdown, và **không** điều
  // hướng — nếu bấm link "Bài tập" thì menu biến mất vì trang đã unmount, không
  // phải vì xử lý bấm-ra-ngoài, và test thành xanh vô nghĩa.
  await page.getByText(/^Xin chào,/).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("bấm mục trong menu KHÔNG bị đóng trước khi hành động chạy", async ({ page }) => {
  await signIn(page, GOOGLE_USER);
  const btn = avatarButton(page);

  let logoutCalled = false;
  await page.route(`${API}/api/auth/logout`, (route) => {
    logoutCalled = true;
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await btn.click();
  await page.getByRole("menuitem", { name: /Đăng xuất/ }).click();

  // Đây là điều làm cho `pointerdown` quan trọng: nếu đóng bằng `click`, handler
  // đóng menu chạy TRƯỚC handler của mục và lệnh đăng xuất không bao giờ chạy.
  await expect.poll(() => logoutCalled).toBe(true);
});

test("phím mũi tên điều hướng được trong menu", async ({ page }) => {
  // Cần hai mục mới kiểm tra vòng bao quanh được, nên dùng tài khoản chưa VIP.
  await signIn(page, { ...GOOGLE_USER, role: "user" });
  await avatarButton(page).click();

  const vip = page.getByRole("menuitem", { name: /Nâng cấp lên VIP/ });
  const signout = page.getByRole("menuitem", { name: /Đăng xuất/ });

  await expect(vip).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(signout).toBeFocused();
  // Vòng: từ mục cuối quay lại mục đầu.
  await page.keyboard.press("ArrowDown");
  await expect(vip).toBeFocused();
  await page.keyboard.press("End");
  await expect(signout).toBeFocused();
  await page.keyboard.press("Home");
  await expect(vip).toBeFocused();
});

test("đổi trang thì không còn menu", async ({ page }) => {
  await signIn(page, GOOGLE_USER);
  await avatarButton(page).click();
  await expect(page.getByRole("menu")).toBeVisible();

  await page.getByRole("link", { name: "Premium" }).click({ force: true });
  await expect(page).toHaveURL(/\/premium/);
  await expect(page.getByRole("menu")).toHaveCount(0);
});
