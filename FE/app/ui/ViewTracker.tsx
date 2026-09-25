"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Gửi pageview mỗi lần đổi route (fire-and-forget, lỗi thì thôi).
// Kèm clerkId khi đăng nhập để admin đếm user khác nhau;
// khách vãng lai thì BE dùng hash IP.
export default function ViewTracker() {
  const pathname = usePathname();
  const { user } = useUser();
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const key = `${pathname}|${user?.id ?? "guest"}`;
    if (sentRef.current === key) return;
    sentRef.current = key;
    fetch(`${API_URL}/api/views/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname, clerkId: user?.id ?? null }),
    }).catch(() => {});
  }, [pathname, user?.id]);

  return null;
}
