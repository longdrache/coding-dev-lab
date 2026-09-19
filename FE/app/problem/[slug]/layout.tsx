import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API_URL}/api/problems/${encodeURIComponent(slug)}`, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error();
    const p = (await res.json()) as { title: string; description: string; difficulty: string; topic: string };
    return {
      title: `${p.title} | GoCode`,
      description: p.description.slice(0, 160),
      openGraph: {
        title: `${p.title} | GoCode`,
        description: p.description.slice(0, 160),
      },
    };
  } catch {
    return {
      title: "Bài tập | GoCode",
      description: "Chi tiết bài tập GoCode.",
    };
  }
}

export default function ProblemSlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
