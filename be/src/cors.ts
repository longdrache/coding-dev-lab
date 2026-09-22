// Dùng chung cho src/main.ts (local) và api/index.ts (Vercel) để
// không bao giờ lệch config CORS giữa 2 entry.
export function getCorsOrigins(): string[] {
  return [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_ADMIN_URL,
    'https://admin-code-lab.vercel.app',
    'https://admin-coding-lab.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter((o): o is string => !!o);
}
