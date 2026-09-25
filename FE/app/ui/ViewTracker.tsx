"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const VISITOR_KEY = "gocode-visitor-id";

function getVisitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

// Gửi pageview mỗi lần đổi route (fire-and-forget, lỗi thì thôi).
// Định danh: clerkId (đăng nhập) > visitorId UUID theo trình duyệt >
// hash IP. Cùng IP khác thiết bị vẫn đếm riêng.
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
      body: JSON.stringify({
        path: pathname,
        clerkId: user?.id ?? null,
        visitorId: getVisitorId(),
      }),
    }).catch(() => {});
  }, [pathname, user?.id]);

  return null;
}
