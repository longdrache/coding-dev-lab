import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bài tập",
  description: "Danh sách 20 bài tập Easy/Trung bình, lọc theo chủ đề và độ khó, chấm batch 10.",
  openGraph: {
    title: "Bài tập | GoCode",
    description: "Luyện 20 bài DSA cốt lõi, 8 ngôn ngữ, chấm tức thì.",
  },
};
export default function ProblemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
