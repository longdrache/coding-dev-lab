"use client";

import { SWRConfig } from "swr";

// Cache chung: giữ data 10s không fetch lại (kể cả remount),
// không refetch khi focus tab (tránh tưởng "không cache").
// Dashboard/activity vẫn tươi nhờ mutate() sau mỗi run/submit.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 10_000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
