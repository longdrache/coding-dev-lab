import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Hỏi đáp",
  description: "Trung tâm Hỏi Đáp GoCode — sandbox, runtimes, lộ trình, phỏng vấn.",
  openGraph: { title: "Hỏi đáp | GoCode" },
};
export default function QnaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
