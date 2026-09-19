"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

export default function PremiumGuard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    if (user?.publicMetadata?.role === "vip") {
      router.replace("/");
    }
  }, [isLoaded, user, router]);

  return null;
}
