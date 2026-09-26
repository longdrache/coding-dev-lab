import { describe, expect, it } from 'vitest';
import { problems } from './problems';
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
