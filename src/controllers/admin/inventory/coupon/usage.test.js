import { describe, expect, it, vi, afterEach } from 'vitest';
import CouponUsage from '../../../../models/CouponUsage.js';
import { buildUsagePipeline, usage } from './usage.js';
import { usageQuerySchema } from '../../../../validations/admin/inventory/coupon/usage.js';

afterEach(() => vi.restoreAllMocks());
describe('coupon usage history', () => {
  it.each([{ page: 0 }, { limit: 101 }, { limit: 1.5 }, { coupon: 'bad' }, { status: 'paid' }, { from_date: '2026-09-20', to_date: '2026-09-19' }, { sort_order: 0 }])('rejects invalid filters %j', query => {
    expect(usageQuerySchema.validate(query).error).toBeDefined();
  });
  it('accepts an inclusive timestamp range and bounded pagination', () => {
    expect(usageQuerySchema.validate({ page: 2, limit: 25, from_date: '2026-09-20T00:00:00Z', to_date: '2026-09-20T23:59:59.999Z' }).error).toBeUndefined();
  });
  it('escapes search characters rather than interpreting a regular expression', () => {
    const pipeline = buildUsagePipeline({ search_key: 'a+b@example.com [VIP]' });
    const match = pipeline.find(stage => stage.$match?.$or).$match.$or;
    const pattern = new RegExp(match[0].email.$regex, 'i');
    expect(pattern.test('a+b@example.com [VIP]')).toBe(true);
    expect(pattern.test('aaab@exampleXcom V')).toBe(false);
  });
  it('retains history with missing references, isolates currency/status totals, and sorts pages deterministically', () => {
    const pipeline = buildUsagePipeline({ coupon: '123456789012345678901234', status: 'refunded', page: 3, limit: 25 });
    expect(String(pipeline[0].$match.coupon)).toBe('123456789012345678901234');
    expect(pipeline[0].$match.status).toBe('refunded');
    expect(pipeline.filter(stage => stage.$unwind).every(stage => stage.$unwind.preserveNullAndEmptyArrays)).toBe(true);
    const facet = pipeline.at(-1).$facet;
    expect(facet.docs[0].$sort).toEqual({ applied_at: -1, _id: -1 });
    expect(facet.docs[1].$skip).toBe(50);
    expect(facet.summary[0].$group._id).toEqual({ currency: '$currency', status: '$status' });
  });
  it('returns pagination and summary across all matching records', async () => {
    vi.spyOn(CouponUsage, 'aggregate').mockResolvedValue([{ docs: [{ email: 'test@example.com' }], count: [{ total: 52 }], summary: [{ count: 52 }] }]);
    const res = { json: vi.fn() }, next = vi.fn();
    await usage({ query: { page: 2, limit: 25 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data).toMatchObject({ totalDocs: 52, totalPages: 3, page: 2, hasPrevPage: true, hasNextPage: true, pagingCounter: 26 });
  });
  it('returns an empty list for no records', async () => {
    vi.spyOn(CouponUsage, 'aggregate').mockResolvedValue([{ docs: [], count: [], summary: [] }]);
    const res = { json: vi.fn() };
    await usage({ query: {} }, res, vi.fn());
    expect(res.json.mock.calls[0][0].data).toMatchObject({ docs: [], totalDocs: 0, hasNextPage: false });
  });
  it('forwards database failures to the error handler', async () => {
    const error = new Error('database unavailable');
    vi.spyOn(CouponUsage, 'aggregate').mockRejectedValue(error);
    const next = vi.fn();
    await usage({ query: {} }, { json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(error);
  });
});
