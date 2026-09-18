"use client";

import type { MouseEvent, ReactNode } from "react";

type SectionLinkProps = {
  /** id của section cần cuộn tới, ví dụ "topics" */
  targetId: string;
  className?: string;
  id?: string;
  children: ReactNode;
};

/**
 * Link tới section trên homepage (/​#id) nhưng cuộn chủ động bằng
 * scrollIntoView thay vì phó mặc cho router của Next.js — router xử lý
 * hash thất thường (lúc cuộn, lúc đứng yên, lúc nhảy lên đầu trang).
 *
 * - Đang ở homepage: chặn điều hướng, cuộn mượt tới section, 100% chạy.
 * - Đang ở trang khác: để browser điều hướng sang /​#id như bình thường,
 *   homepage có effect tự cuộn tới hash khi load (xem app/page.tsx).
 * - Không có JS: vẫn là thẻ <a> chuẩn nên browser tự nhảy tới anchor.
 */
export default function SectionLink({
  targetId,
  className,
  id,
  children,
}: SectionLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/") return;
    const element = document.getElementById(targetId);
    if (!element) return;
    event.preventDefault();
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <a
      id={id}
      href={`/#${targetId}`}
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
