import { Suspense } from "react";
import ProblemList from "./ProblemList";
import type { Problem } from "@/app/data/problems";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Server fetch danh sách bài trước khi trả HTML: refresh (F5) hiện full
// nội dung ngay lần paint đầu, không chớp skeleton, client không cần
// fetch lại (SWR dùng initial làm fallback, revalidateIfStale: false).
// BE down thì trả null sau tối đa 4s, client tự dùng SWR cache cũ.
async function getInitialProblems(): Promise<Problem[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/problems`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as Problem[]) : null;
  } catch {
    return null;
  }
}

export default async function ProblemPage() {
  const initial = await getInitialProblems();
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-wash px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] animate-pulse">
            <div className="h-12 w-72 rounded-lg bg-zinc-200" />
          </div>
        </main>
      }
    >
      <ProblemList initial={initial} />
    </Suspense>
  );
}
