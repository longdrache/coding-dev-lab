import Link from "next/link";
import Logo from "@/app/ui/Logo";
import SectionLink from "@/app/ui/SectionLink";
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
          Lộ trình học
        </p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-500">
          Trang đang được hoàn thiện. Trong lúc chờ, bạn có thể bắt đầu ngay
          với các dạng bài luyện tập.
        </p>
        <SectionLink
          targetId="topics"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Xem dạng bài →
        </SectionLink>
      </div>
    </main>
  );
}
