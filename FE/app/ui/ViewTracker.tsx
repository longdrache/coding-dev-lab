"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Gửi pageview mỗi lần đổi route (fire-and-forget, lỗi thì thôi).
// Không tracking gì thêm ngoài path để admin đếm visits.
export default function ViewTracker() {
  const pathname = usePathname();
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || sentRef.current === pathname) return;
    sentRef.current = pathname;
    fetch(`${API_URL}/api/views/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
