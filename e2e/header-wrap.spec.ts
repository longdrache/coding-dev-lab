import { expect, test, type Page } from '@playwright/test';

/*
 * Header từng vỡ ở mọi bề rộng hẹp: "Đăng nhập" và "Đăng ký" bị bẻ thành hai
 * dòng ("Đăng" / "nhập"), hai badge trạng thái cũng vậy, và nút "Đăng ký" đen
 * thành một khối to. Nguyên nhân là header xếp bằng `justify-between` với các
 * khối con không chịu co (`flex-shrink`), nên khi tổng bề rộng tự nhiên vượt quá
 * chỗ trống, flex bóp từng khối lại và chữ bên trong bẻ dòng.
 *
 * Test này canh đúng bất biến đó thay vì canh một ảnh chụp: **không node chữ nào
 * của header được vẽ trên nhiều dòng** ở từng bề rộng. Nó phải đứng ngoài
 * `vitest` của FE vì `vitest.config.ts` chạy `environment: 'node'` — không có
 * jsdom, không dựng được layout. Bề rộng lấy đúng những mốc đã vỡ: 320–390 là
 * điện thoại, 640–768 là dải mà nav desktop cùng nút CTA cùng xuất hiện, 1024 và
 * 1280 là hai mốc breakpoint mà header dùng.
 */
const WIDTHS = [320, 360, 390, 640, 768, 1024, 1280];

/** Nhãn của mọi node chữ trong `scope` đang bị vẽ trên nhiều dòng. */
async function wrappedLabels(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return [];
    const out: string[] = [];
    for (const el of root.querySelectorAll('*')) {
      if (el.childElementCount > 0) continue;
      const text = (el.textContent ?? '').trim();
      if (text === '' || el.getClientRects().length === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      // Một dòng có thể trả về nhiều rect (ví dụ chữ có dấu tiếng Việt), nên
      // phải đếm số `top` khác nhau chứ không đếm số rect.
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      if (tops.size > 1) out.push(text.replace(/\s+/g, ' '));
    }
    return out;
  }, selector);
}

for (const width of WIDTHS) {
  test(`header không bẻ dòng chữ ở ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    // Chờ phiên `/me` xong: đang tải thì header hiện skeleton chứ chưa có nút.
    // `aria-busy` nằm trên khối chứa cả hai nút nên canh được ở **mọi** bề rộng,
    // kể cả khi dưới `sm` cả khối đó đang `hidden` (chờ nó "visible" thì treo).
    await expect(page.locator('header [aria-busy]')).toHaveAttribute(
      'aria-busy',
      'false',
      { timeout: 60_000 },
    );

    expect(await wrappedLabels(page, 'header')).toEqual([]);

    // Chữ không bẻ dòng là chưa đủ: nếu tổng bề rộng vượt chỗ trong thì khối bị
    // bóp/đẩy ra ngoài và người dùng mất nút, nên cấm luôn tràn ngang.
    const spill = await page.evaluate(() => {
      const row = document.querySelector('header > div');
      if (!row) return [];
      const cs = getComputedStyle(row);
      const box = row.getBoundingClientRect();
      const left = box.left + parseFloat(cs.paddingLeft);
      const right = box.right - parseFloat(cs.paddingRight);
      return [...document.querySelectorAll('header *')]
        .filter((el) => el.getClientRects().length > 0)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          // Bỏ qua chính hàng chứa padding, và mọi svg: logo xoay `-rotate-6` nên
          // hộp bao hình học rộng hơn hộp layout, không phải tràn thật.
          if (el === row || el instanceof SVGElement) return false;
          return r.width > 0 && (r.right > right + 0.5 || r.left < left - 0.5);
        })
        .map((el) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30));
    });
    expect(spill).toEqual([]);
  });
}

for (const width of [320, 360, 390]) {
  test(`menu mobile ở ${width}px không bẻ dòng chữ`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Mở menu' })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Mở menu' }).click();
    // Footer cũng có link "Premium", nên phải khoanh vùng trong header.
    await expect(
      page.locator('header').first().getByRole('link', { name: 'Premium' }),
    ).toBeVisible();
    expect(await wrappedLabels(page, 'header')).toEqual([]);
  });
}
