import { afterEach, describe, expect, it, vi } from 'vitest';
import User from '../../../models/User.js';
import Order from '../../../models/Order.js';
import { list } from './list.js';
afterEach(() => vi.restoreAllMocks());
describe('customer directory', () => {
  it('combines import/search filters and enriches only the requested page with linked order activity', async () => {
    const id = '123456789012345678901234';
    const aggregate = vi.spyOn(User, 'aggregate').mockReturnValue({});
    vi.spyOn(User, 'aggregatePaginate').mockResolvedValue({ docs: [{ _id: id, name: 'Fixture' }], totalDocs: 1 });
    const orders = vi.spyOn(Order, 'aggregate').mockResolvedValue([{ _id: id, order_count: 2, last_order_at: new Date('2024-01-01') }]);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
    await list({ query: { search_key: 'a+b', import_source: 'backup' }, params: {}, __: value => value }, res, next);
    expect(next).not.toHaveBeenCalled();
    const match = aggregate.mock.calls[0][0][0].$match;
    expect(match.$or[0].name.$regex).toBe('a\\+b');
    expect(match.$and).toHaveLength(1);
    expect(orders.mock.calls[0][0][0].$match).toEqual({ user: { $in: [id] }, deleted_at: null });
    expect(res.json.mock.calls[0][0].data.docs[0]).toMatchObject({ order_count: 2, last_order_at: new Date('2024-01-01') });
  });
  it('avoids querying orders for an empty customer page', async () => {
    vi.spyOn(User, 'aggregate').mockReturnValue({});
    vi.spyOn(User, 'aggregatePaginate').mockResolvedValue({ docs: [], totalDocs: 0 });
    const orders = vi.spyOn(Order, 'aggregate');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
    await list({ query: {}, params: {}, __: value => value }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(orders).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.docs).toEqual([]);
  });
});
