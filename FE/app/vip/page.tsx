import { redirect } from "next/navigation";

export default async function VipRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/premium/thank-you${suffix}`);
}
