"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/ui/AuthProvider";

export default function PremiumGuard() {
  // `role` nằm thẳng trong `/me` (`PublicUser`) — trước đây nó nằm trong
  // `publicMetadata` của nhà cung cấp danh tính cũ.
  const { user, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.role === "vip") {
      router.replace("/");
    }
  }, [loading, user, router]);

  return null;
}
