import { describe, expect, it } from 'vitest';
import { BADGE_DEFS, calcStreakFromMap } from './progress.service.ts';

function vnKey(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  // dựng key dd-mm-yyyy theo giờ VN giống logic service
  const parts = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' }).split('/');
  const [day, month, year] = parts;
  return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
}

describe('BADGE_DEFS', () => {
  it('12 huy hiệu, id duy nhất, đủ field', () => {
    expect(BADGE_DEFS).toHaveLength(12);
    const ids = BADGE_DEFS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BADGE_DEFS) {
      expect(b.name).toBeTruthy();
      expect(b.desc).toBeTruthy();
    }
  });
});

describe('calcStreakFromMap', () => {
  it('đếm chuỗi liên tiếp tới hôm nay', () => {
    const map: Record<string, number> = {
      [vnKey(0)]: 2,
      [vnKey(1)]: 1,
      [vnKey(2)]: 3,
    };
    expect(calcStreakFromMap(map)).toBe(3);
  });

  it('hôm nay nghỉ thì tính từ hôm qua', () => {
    const map: Record<string, number> = { [vnKey(1)]: 1, [vnKey(2)]: 1 };
    expect(calcStreakFromMap(map)).toBe(2);
  });

  it('đứt quãng thì dừng ở chỗ đứt, rỗng = 0', () => {
    const map: Record<string, number> = { [vnKey(0)]: 1, [vnKey(2)]: 1 };
    expect(calcStreakFromMap(map)).toBe(1);
    expect(calcStreakFromMap({})).toBe(0);
  });
});
