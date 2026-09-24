"use client";

import { animate, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";
import { topics } from "@/app/data/topics";

const totalProblems = topics.reduce((sum, topic) => sum + topic.count, 0);

function CountUp({
  to,
  prefix = "",
  suffix = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {val}
      {suffix}
    </span>
  );
}

const stats = [
  { value: <CountUp to={totalProblems} />, label: "Bài tập luyện" },
  { value: <CountUp to={5} />, label: "Ngôn ngữ hỗ trợ" },
  { value: <CountUp to={100} prefix="<" suffix="ms" />, label: "Chấm bài trung bình" },
];

export default function StatsStrip() {
  return (
    <Reveal>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <div className="grid grid-cols-2 gap-y-6 rounded-2xl border border-zinc-300 bg-white px-6 py-6 shadow-sm sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold tracking-tight text-zinc-950 tabular-nums">
                {stat.value}
              </p>
              <p className="mt-1 text-xs font-medium text-zinc-600">{stat.label}</p>
            </div>
          ))}
          <div className="flex flex-col items-center justify-center gap-2">
            <p className="text-2xl font-bold tracking-tight text-zinc-950 tabular-nums">
              {'> 1'}
            </p>
            <p className="text-xs font-medium text-zinc-600">Đang sử dụng</p>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
