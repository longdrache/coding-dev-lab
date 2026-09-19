import Link from "next/link";
import Logo from "@/app/ui/Logo";
import { ArrowLeft } from "lucide-react";

export default function Page() {
  return (
    <main className="min-h-screen bg-white px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-zinc-800 transition"
          >
            <ArrowLeft className="size-4" />
            Trang chủ
          </Link>
        </div>
        <p className="mt-10 text-3xl font-bold tracking-tight text-zinc-950">
          Thử thách
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
          Trang đang được hoàn thiện. Trong lúc chờ, hãy khởi động với cuộc
          thi hàng tuần hoặc kho bài tập.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            <ArrowLeft className="size-4" />
            Về trang chủ
          </Link>
          <Link
            href="/problem"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Vào sân luyện
          </Link>
        </div>
      </div>
    </main>
  );
}
