import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Lộ trình",
  description: "Lộ trình học DSA từ cơ bản đến Trung bình, 8 chủ đề, 20 bài.",
  openGraph: { title: "Lộ trình | GoCode" },
};
export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
