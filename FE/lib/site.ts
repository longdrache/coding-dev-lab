// URL canonical của site: ưu tiên env deploy, Vercel tự có VERCEL_URL,
// local dev dùng localhost. Đổi NEXT_PUBLIC_SITE_URL khi có domain thật.
export function getSiteUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
