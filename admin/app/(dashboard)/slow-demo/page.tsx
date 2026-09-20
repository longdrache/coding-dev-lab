export const dynamic = "force-dynamic";
import { adminFetch } from "@/lib/api";
export default async function SlowDemoPage() {
  // Giả lập trang load chậm 5s để TopLoader chạy lâu cho dễ quan sát.
  // Vì là Server Component + force-dynamic, delay chỉ chạy khi request,
  // không làm chậm lúc build.
  // await new Promise((r) => setTimeout(r, 5000));
 const url = '/api/admin/users?';
  await  adminFetch(url)
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black p-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(500px_circle_at_0%_0%,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Slow Demo</h1>
          <p className="mt-1 text-sm font-medium text-zinc-400">
            Trang này delay 5s ở server nên TopLoader trên cùng sẽ chạy lâu.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">Load xong!</p>
        <p className="mt-1 text-sm text-zinc-600">
          Bấm qua lại giữa các menu (Dashboard / Problems / Slow Demo) để thấy
          thanh loader đen mảnh chạy trên cùng.
        </p>
      </div>
    </div>
  );
}
