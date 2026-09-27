"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "./AuthProvider";

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
// Định danh: userId (đăng nhập) > visitorId UUID theo trình duyệt >
// hash IP. Cùng IP khác thiết bị vẫn đếm riêng.
//
// Tên trường là `userId` chứ không phải tên cũ vì `views.controller.ts:26` chỉ
// đọc `userId` và chỉ nhận **number** — `User.id` của BE là `Int`, còn id của nhà
// cung cấp danh tính cũ là chuỗi nên trước đây mọi pageview của người đã đăng
// nhập đều bị rơi thành khách vãng lai, và thống kê "unique" đếm trùng mỗi lần F5.
export default function ViewTracker() {
  const pathname = usePathname();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const sentRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const key = `${pathname}|${userId ?? "guest"}`;
    if (sentRef.current === key) return;
    sentRef.current = key;
    fetch(`${API_URL}/api/views/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        userId,
        visitorId: getVisitorId(),
      }),
    }).catch(() => {});
  }, [pathname, userId]);

  return null;
}
