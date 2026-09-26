import { describe, expect, it } from 'vitest';
import { pricingPlans } from './pricing';

describe('pricing data', () => {
  it('đủ 3 gói daily/monthly/yearly, giá VND dương', () => {
    const ids = pricingPlans.map((p) => p.id).sort();
    expect(ids).toEqual(['daily', 'monthly', 'yearly']);
    for (const p of pricingPlans) {
      expect(p.totalBilledVND).toBeGreaterThan(0);
      expect(p.monthlyEquivalentVND).toBeGreaterThan(0);
      expect(p.features.length).toBeGreaterThan(0);
      expect(p.ctaVi).toBeTruthy();
    }
  });

  it('gói năm rẻ hơn 12 tháng lẻ', () => {
    const monthly = pricingPlans.find((p) => p.id === 'monthly')!;
    const yearly = pricingPlans.find((p) => p.id === 'yearly')!;
    expect(yearly.totalBilledVND).toBeLessThan(monthly.totalBilledVND * 12);
  });

  it('gói ngày hết hạn sau 1 ngày (200₫)', () => {
    const daily = pricingPlans.find((p) => p.id === 'daily')!;
    expect(daily.totalBilledVND).toBe(200);
  });
});
