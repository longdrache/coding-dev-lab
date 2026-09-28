/**
 * Lớp ngoài dùng chung cho màn auth: khung thẻ, nhãn mono, tiêu đề, câu chữ,
 * và ba nút. Tách ra để các màn (form, màn "đã đăng ký", màn "xác nhận email")
 * không tự chép lại class mỗi chỗ.
 *
 * Quy tắc này do chính `AuthForm.tsx` đề ra: "hai nơi một luật là hai nơi sẽ
 * lệch". Sửa đổi cần đổi cả hai chỗ, không chỉ sửa một.
 */

export const CARD = "w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
/**
 * `tracking-wide` chứ không phải `tracking-widest` như brief gợi ý: `DESIGN.md`
 * ghim `letterSpacing: 0.04em` cho mono-label, và 0.1em làm nhãn rời rạc khỏi
 * câu nó dẫn. `emerald-700` (5.5:1) thay vì `emerald-600` (3.8:1) vì nhãn này
 * nhỏ — cần mức tương phản của chữ thường, không phải của chữ lớn.
 */
export const KICKER = "font-mono text-xs font-medium uppercase tracking-wide text-emerald-700";
export const TITLE = "mt-2.5 font-display text-xl font-bold tracking-tight text-zinc-950";
export const BODY = "mt-2 text-sm leading-relaxed text-zinc-600";
/** `bg-white` + `ring-offset-white` để vòng focus nhìn thấy trên nền thẻ. */
export const INPUT =
  "w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-950 " +
  "transition-colors focus:border-zinc-400 focus:bg-white focus:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-zinc-900/15";
export const PRIMARY =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 " +
  "text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-zinc-900";
export const SECONDARY =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 " +
  "py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "disabled:cursor-not-allowed disabled:opacity-60";
export const FOOTER = "text-center text-xs text-zinc-500";
export const FOOTER_LINK = "font-medium text-zinc-900 underline underline-offset-4 hover:text-emerald-700";
export const SPINNER = "size-4 animate-spin motion-reduce:animate-none";
