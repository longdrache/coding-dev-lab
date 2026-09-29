import { describe, expect, it } from 'vitest';
import { problems, VIP_PROBLEM_COUNT, VIP_SLUGS, isVipProblem } from './problems';
import { topics } from './topics';

const DIFFICULTIES = ['Dễ', 'Trung bình', 'Khó'];
const TOPICS = new Set(topics.map((t) => t.slug));

describe('problems data', () => {
  it('mỗi đề đủ field, slug duy nhất, difficulty/topic hợp lệ', () => {
    expect(problems.length).toBeGreaterThan(0);
    const slugs = problems.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of problems) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.title).toBeTruthy();
      expect(DIFFICULTIES).toContain(p.difficulty);
      expect(TOPICS.has(p.topic)).toBe(true);
      expect(p.description).toBeTruthy();
      expect(p.examples.length).toBeGreaterThan(0);
    }
  });

  it('mỗi đề có test mẫu + test ẩn, stdin/expected là string', () => {
    for (const p of problems) {
      expect(p.tests.length).toBeGreaterThan(0);
      expect(p.hiddenTests.length).toBeGreaterThan(0);
      for (const t of [...p.tests, ...p.hiddenTests]) {
        expect(typeof t.stdin).toBe('string');
        expect(typeof t.expected).toBe('string');
      }
    }
  });

  it('single-number tuân thủ constraint (số lẻ xuất hiện đúng 1 lần)', () => {
    const p = problems.find((x) => x.slug === 'single-number');
    if (!p) return;
    for (const t of [...p.tests, ...p.hiddenTests]) {
      const nums = t.stdin.trim().split(/\s+/).slice(1).map(Number);
      const freq = new Map<number, number>();
      for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
      const singles = [...freq.values()].filter((c) => c === 1).length;
      const pairs = [...freq.values()].filter((c) => c === 2).length;
      expect(singles).toBe(1);
      expect(pairs).toBe(freq.size - 1);
      expect(Number(t.expected)).toBe(
        [...freq.entries()].find(([, c]) => c === 1)![0],
      );
    }
  });
});

/**
 * Dựng lại quy tắc chọn bài VIP **từ đầu**, không gọi hàm cần kiểm.
 *
 * Ý nghĩa: nếu ai đó đổi `VIP_SLUGS` thành danh sách viết tay, test này phải đỏ
 * chứ không trượt — đó là lý do nó tự tính thay vì so với chính nó.
 */
const RANH: Record<string, number> = { "Dễ": 0, "Trung bình": 1, "Khó": 2 };

function vipTheoQuyTac() {
  return problems
    .map((p, index) => ({ slug: p.slug, rank: RANH[p.difficulty], index }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .slice(0, VIP_PROBLEM_COUNT)
    .map((r) => r.slug);
}

describe('quy tắc chọn bài VIP', () => {
  it('đúng 20 bài, không lặp, mọi slug đều tồn tại trong problems', () => {
    expect(VIP_PROBLEM_COUNT).toBe(20);
    expect(VIP_SLUGS).toHaveLength(20);
    expect(new Set(VIP_SLUGS).size).toBe(20);
    const co = new Set(problems.map((p) => p.slug));
    for (const slug of VIP_SLUGS) expect(co.has(slug)).toBe(true);
  });

  it('khớp đúng quy tắc: độ khó giảm dần, hoà thì giữ thứ tự khai báo', () => {
    expect([...VIP_SLUGS]).toEqual(vipTheoQuyTac());
  });

  it('tất định: gọi lại nhiều lần vẫn ra cùng một danh sách', () => {
    const lanDau = [...VIP_SLUGS];
    for (let i = 0; i < 3; i++) expect([...VIP_SLUGS]).toEqual(lanDau);
  });

  it('bài VIP không bao giờ lọt vào nhóm dễ', () => {
    const de = new Set(problems.filter((p) => p.difficulty === "Dễ").map((p) => p.slug));
    for (const slug of VIP_SLUGS) expect(de.has(slug)).toBe(false);
  });

  it('mọi bài Khó đều được chọn — không bỏ sót bài khó nhất', () => {
    const kho = problems.filter((p) => p.difficulty === "Khó").map((p) => p.slug);
    for (const slug of kho) expect(VIP_SLUGS).toContain(slug);
  });

  it('isVipProblem đồng bộ với VIP_SLUGS ở cả hai chiều', () => {
    for (const p of problems) expect(isVipProblem(p.slug)).toBe(VIP_SLUGS.includes(p.slug));
    expect(isVipProblem('khong-ton-tai')).toBe(false);
  });
});
