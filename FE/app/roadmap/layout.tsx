import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Tiến độ",
  description: "Tiến độ luyện tập theo 8 chủ đề DSA.",
  openGraph: { title: "Tiến độ | GoCode" },
};
export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
