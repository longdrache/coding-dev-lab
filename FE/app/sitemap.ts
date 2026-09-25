import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 3600;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ProblemRow = { slug: string };

// Sitemap: route tĩnh + 56 đề (fetch BE, lỗi thì chỉ trả route tĩnh).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const staticRoutes = ["", "/problem", "/premium", "/qna", "/roadmap", "/challenges"].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.8,
    }),
  );

  try {
    const res = await fetch(`${API_URL}/api/problems`, { next: { revalidate: 3600 } });
    if (!res.ok) return staticRoutes;
    const problems = (await res.json()) as ProblemRow[];
    if (!Array.isArray(problems)) return staticRoutes;
    return [
      ...staticRoutes,
      ...problems
        .filter((p) => typeof p?.slug === "string")
        .map((p) => ({
          url: `${base}/problem/${p.slug}`,
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        })),
    ];
  } catch {
    return staticRoutes;
  }
}
