import { describe, expect, it } from 'vitest';
import { couponSchema } from './add.js';

const campaign = {
  code: 'SAVE20', title: 'Weekend offer', discount_type: 'percentage',
  discount_value: 20, applicable_for: 'both',
  start_date: new Date('2026-09-20'), end_date: new Date('2026-09-21'),
};

describe('coupon campaign validation', () => {
  it('accepts a campaign with an optional empty description', () => {
    expect(couponSchema.validate({ ...campaign, description: null }).error).toBeUndefined();
  });
  it.each([
    { discount_value: 101 }, { discount_value: 0 },
    { end_date: new Date('2026-09-19') },
    { applicable_scope: 'product' },
    { applicable_scope: 'product', applicable_products: ['invalid-id'] },
    { usage_limit: 1.5 }, { usage_per_email: 0 },
  ])('rejects invalid campaign rules: %j', patch => {
    expect(couponSchema.validate({ ...campaign, ...patch }).error).toBeDefined();
  });
  it('allows fixed discounts above 100', () => {
    expect(couponSchema.validate({ ...campaign, discount_type: 'fixed', discount_value: 500 }).error).toBeUndefined();
  });
});
