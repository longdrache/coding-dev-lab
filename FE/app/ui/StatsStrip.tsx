import Reveal from "./Reveal";
import { topics } from "@/app/data/topics";

const totalProblems = topics.reduce((sum, topic) => sum + topic.count, 0);

const stats = [
  { value: `${totalProblems}`, label: "Bài tập luyện" },
  { value: "5", label: "Ngôn ngữ hỗ trợ" },
  { value: "<25ms", label: "Chấm bài trung bình" },
];

export default function StatsStrip() {
  return (
    <Reveal>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="grid grid-cols-2 gap-y-6 rounded-2xl border border-zinc-200/80 bg-white px-6 py-6 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold tracking-tight text-zinc-950 tabular-nums">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-zinc-500">{stat.label}</p>
            </div>
          ))}
          <div className="flex flex-col items-center justify-center gap-2">
            <p className="text-2xl font-bold tracking-tight text-zinc-950 tabular-nums">
              1
            </p>
            <p className="text-xs text-zinc-500">Đang sử dụng</p>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
