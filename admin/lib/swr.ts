import { adminFetch } from "./api";

// Fetcher dùng chung cho SWR: ném Error khi BE trả lỗi để SWR bắt,
// tự parse JSON. Mọi trang admin dùng chung qua useSWR(url, swrFetcher).
export async function swrFetcher<T = unknown>(url: string): Promise<T> {
  const res = await adminFetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || `Failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}
