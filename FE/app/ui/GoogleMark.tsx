import type { SVGProps } from "react";

/**
 * Logo Google bốn màu, vẽ thẳng bằng SVG.
 *
 * **Không dùng icon library.** Repo dùng `lucide-react` và nó **không có**
 * logo Google — chỉ có những icon chung kiểu `Chrome`, `Globe`. Cài thêm một
 * gói icon chỉ để lấy đúng một cái logo thì không đáng; đây cũng là thứ mà
 * Google yêu cầu giữ nguyên màu gốc khi dùng trong nút đăng nhập.
 *
 * Tách file riêng như `Logo.tsx` chứ không nhét vào `auth-tokens.ts`: file đó
 * là **class dùng chung** ("khung thẻ, nhãn mono, tiêu đề, ba nút"), còn đây là
 * một hình ảnh thương hiệu chỉ dùng đúng một chỗ. `auth-tokens.ts` cũng là
 * `.ts` — để JSX vào đó phải đổi đuôi file rồi sửa mọi chỗ import.
 *
 * `aria-hidden` vì nút luôn có chữ "Tiếp tục với Google" ngay cạnh: đọc logo
 * thành "Google, Google" chỉ là nhiễu cho screen reader.
 */
export default function GoogleMark({ className = "", ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false" {...rest}>
      {/* Bốn path là bốn cánh của chữ G, xếp đúng thứ tự BE vẽ: vàng trên,
          xanh bên phải, đỏ dưới, xanh lá quanh. */}
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
