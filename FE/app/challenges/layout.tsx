import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Thử thách",
  description: "Thử thách GoCode — cọ xát cùng cộng đồng, sắp ra mắt.",
  openGraph: { title: "Thử thách | GoCode" },
};
export default function ChallengesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
