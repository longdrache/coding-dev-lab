type Entry<T> = { value: T; expiresAt: number };

// Ngưỡng số key để prune. Cần khi cache khoá theo thứ tăng không giới hạn
// (vd theo user id): key chết sẽ không bao giờ bị get() chạm tới nên tích
// tụ vĩnh viễn nếu không dọn.
const PRUNE_AT = 500;

/**
 * Cache in-memory có TTL cho dữ liệu gần như tĩnh (bài toán đã publish)
 * hoặc đọc nhiều ghi ít (dashboard). Chủ dùng một instance cho một nhóm key,
 * TTL set lúc khởi tạo. Hết TTL thì key bị coi như không có; không có
 * chính sách LRU — caller quyết định phạm vi key.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (Date.now() >= hit.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.entries.size >= PRUNE_AT) this.prune();
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Xoá mọi entry đã hết hạn, trả số lượng bị xoá. */
  prune(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) {
        this.entries.delete(key);
        removed++;
      }
    }
    return removed;
  }
}
