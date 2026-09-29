/**
 * Khoá tạm 10 giây cho nút "Gửi link đặt lại" ở màn quên mật khẩu, sau **mỗi**
 * lần bấm.
 *
 * **Cái này KHÔNG phải lớp bảo mật.** Bảo mật thật đã nằm sẵn ở BE, và đã có từ
 * trước:
 *
 * - `POST /api/auth/forgot-password` có `@UseGuards(ThrottleGuard)` +
 *   `@Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })`
 *   (`be/src/auth/auth.controller.ts:304-307`) — 20 lần/giờ theo IP.
 * - `AuthService.forgotPassword` còn chặn theo **tài khoản**: một email mỗi
 *   `RESET_TTL_MS` = 1 giờ (`be/src/auth/auth.service.ts:78,573-595`), và nhánh bị
 *   chặn đó cũng trả **đúng câu thành công** như mọi trường hợp khác.
 *
 * Thứ ở đây là **lớp phủ cho người dùng thật**: dừng vòng bấm vô ích, và nói rõ
 * bao lâu nữa nút mở lại. Kẻ tấn công không gặp khó khăn gì ở đây — sửa state
 * trong React DevTools là xong. Đừng kể con số này như thể nó bảo vệ được cái
 * gì; nó không.
 *
 * **Vì sao 10 giây.** Chỉ cần chặn đúng một thứ: bấm liên tục. Người dùng bấm
 * một lần, đi kiểm tra hộp thư, không thấy, bấm thêm — đó là phản xạ bình
 * thường, và phải họ là người quyết định có bấm lại hay không.
 *
 * - **Ngắn hơn, ví dụ 1 giây**: bấm xong nút khoá, lập tức tưởng hỏng. Người dùng
 *   vẫn phải tra cứu xem có thật sự khoá không, tức công cụ trả lời "nút hỏng".
 * - **Dài hơn, ví dụ 1 phút**: đã là khoá, mà khoá ở màn quên mật khẩu là **vũ khí
 *   tấn công nếu ai đó dùng sai**. Kẻ xấu biết trước email nạn nhân, đứng điền
 *   form tới khi hết hạn thì nạn nhân không bấm được nút nữa — tài khoản bị chiếm
 *   với người quên mật khẩu. Ngưỡng an toàn là thứ **tự biến mất trong thời gian
 *   mà người dùng chịu đợi nổi**, và 10 giây là ngưỡng đó.
 *
 * 10 giây cũng **luôn ngắn hơn** hạn 1 giờ/tài khoản của BE, nên khoá ở tầng UI
 * không bao giờ là thứ khiến người dùng mất khả năng lấy lại tài khoản.
 *
 * **Vì sao không lưu bền.** Số lần bấm trước đó **không** được ghi ở đâu cả, kể
 * cả `sessionStorage`. Chủ repo chốt chỉ cần cooldown, nên **F5 bypass được** —
 * đóng tab, mở lại là mất. Điều đó được chấp nhận có chủ đích: lớp thật sự bảo
 * vệ tài khoản nằm ở BE (xem đầu file), và ghi dấu vết lâu dài vào máy người
 * dùng để đổi lấy một cái khoá mà DevTools xoá được là một cuộc đánh đổi
 * không đáng.
 *
 * **Không lộ có tồn tại tài khoản.** Cooldown tính từ lúc **người dùng bấm**, chứ
 * không phải từ kết quả BE trả về, nên nó tăng **giống nhau** với email có tài
 * khoản và email không có. Câu ở `cooldownMessage` cũng cố ý không nhắc email,
 * không nói gì về kết quả gửi — đúng nguyên tắc mà `forgotPassword` ở BE giữ suốt
 * luồng này: khác biệt nằm ở việc *có gửi mail hay không*, không nằm ở câu trả
 * lời.
 *
 * `vitest.config.ts` chạy `environment: 'node'` (không jsdom) và chỉ nạp
 * `*.test.ts`, nên không dựng được component. Đây là lý do **mọi quyết định về
 * thời gian** nằm ở file .ts thuần này, còn `app/forgot-password/page.tsx` chỉ nối
 * state với DOM — đúng cách `@/lib/auth-submit` làm cho nút đăng nhập/đăng ký.
 */

/**
 * Độ dài cooldown, tính bằng mili giây.
 *
 * Mốc tuyệt đối chứ không phải "đếm ngược mỗi giây": `cooldownUntil` trả về một
 * mốc thời gian, và mọi lần đọc lại đều tính `mốc - Date.now()`. Nhờ vậy đồng hồ
 * vẫn đúng sau khi tạm chuyển tab — trình duyệt hãm timer của tab ẩn, một bộ đếm
 * giảm từng nhịp sẽ đứng yên rồi tụt về 0 trong khi thực tế còn hàng giây — và
 * vẫn đúng khi component render lại vì lý do nào đó.
 */
export const FORGOT_COOLDOWN_MS = 10_000;

/** Mốc thời gian hết hạn của lần khoá, tính từ lúc bấm. */
export function cooldownUntil(now: number): number {
  return now + FORGOT_COOLDOWN_MS;
}

/**
 * Còn bao lâu thì nút mở lại, mili giây. `0` khi không khoá.
 *
 * `Math.max(…, 0)` là bắt buộc chứ không phải cho đẹp: hết mốc thì phải ra `0`
 * chứ không phải số âm, vì số âm sẽ khiến nút kẹt vĩnh viễn. Nó cũng là chỗ để
 * `formatCountdown` không bao giờ phải xử lý số âm.
 */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(deadline - now, 0);
}

/** Chặn bấm không, tại **thời điểm `now`**. Chỗ gọi phải chốt cả hai lần. */
export function isCooling(deadline: number, now: number): boolean {
  return remainingMs(deadline, now) > 0;
}

/**
 * Số giây còn lại, làm tròn **lên**.
 *
 * Làm tròn xuống sẽ hiện "0" trong khoảng một giây cuối, tức nói "còn 0 giây" khi
 * thực tế còn 1 — người dùng đợi hoài không thấy nút mở thì bấm thử, bấm không
 * ăn, rồi tưởng nút chết hẳn.
 */
export function formatCountdown(ms: number): string {
  return String(Math.max(Math.ceil(ms / 1000), 0));
}

/**
 * Câu thông báo lúc đang khoá, đọc bằng trình đọc màn hình.
 *
 * Ba điều bắt buộc:
 *
 * 1. **Nói còn bao lâu**, dựng từ `FORGOT_COOLDOWN_MS` chứ không gõ tay. Gõ tay
 *    thì đổi hằng mà quên sửa câu là người dùng được hứa một số giây khác với
 *    số giây họ thật sự phải chờ.
 * 2. **Nói rõ nó tự mở.** Đây là khác biệt giữa cooldown và khoá vĩnh viễn. Không
 *    nói ra thì người dùng đọc xong hiểu là mình vừa tự khoá tài khoản của mình.
 * 3. **Nói không có gì bị khoá cả** — cùng lý do, nhưng nói thẳng.
 *
 * Cố ý **không** nhắc tới email và **không** nói gì về kết quả gửi: cooldown đếm
 * lúc bấm chứ không đếm lần BE gửi mail, nên nó tăng như nhau với mọi email — câu
 * nào có nhắc "tài khoản của bạn" là đang tự phá nguyên tắc "không lộ có tồn tại
 * tài khoản".
 */
export function cooldownMessage(): string {
  const seconds = FORGOT_COOLDOWN_MS / 1000;
  return `Nút gửi đang tạm khoá ${seconds} giây để khỏi bấm liên tục. `
    + "Cứ chờ là tự mở lại — không có gì bị khoá cả.";
}

/**
 * Câu báo khi nút vừa mở lại.
 *
 * Cần nói **tích cực** chứ không chỉ im im bỏ khoá: trong `role="status"`, việc
 * nội dung vùng đó đổi sang câu này chính là thứ báo cho trình đọc màn hình biết
 * đã mở. Bỏ trống thì người dùng đọc bằng tai không có tín hiệu nào cho biết lúc
 * nào được bấm lại.
 */
export function unlockedMessage(): string {
  return "Nút gửi đã mở lại, bạn bấm lại được rồi.";
}
