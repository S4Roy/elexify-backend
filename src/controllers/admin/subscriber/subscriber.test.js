import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../models/Subscriber.js', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), aggregate: vi.fn(), aggregatePaginate: vi.fn() } }));
vi.mock('../../../resources/SubscriberResource.js', () => ({ default: { collection: vi.fn(async docs => docs) } }));
import Subscriber from '../../../models/Subscriber.js';
import { edit } from './edit.js';
import { list } from './list.js';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
describe('subscriber management', () => {
  beforeEach(() => vi.clearAllMocks());
  it('excludes deleted subscribers from status updates and records the operator', async () => {
    Subscriber.findOne.mockResolvedValue({ _id: 'id' });
    Subscriber.findOneAndUpdate.mockResolvedValue({ status: 'unsubscribed' });
    const res = response();
    const next = vi.fn();
    await edit({ body: { _id: 'id', status: 'unsubscribed' }, auth: { user_id: 'operator' }, __: s => s }, res, next);
    expect(Subscriber.findOneAndUpdate).toHaveBeenCalledWith({ _id: 'id', deleted_at: null }, { $set: expect.objectContaining({ status: 'unsubscribed', updated_by: 'operator' }) }, { new: true, runValidators: true });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('does not update a missing or deleted record', async () => {
    Subscriber.findOne.mockResolvedValue(null);
    const next = vi.fn();
    await edit({ body: { _id: 'id', status: 'suppressed' }, __: s => s }, response(), next);
    expect(next).toHaveBeenCalled();
    expect(Subscriber.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('treats search as literal text and combines source/status filters', async () => {
    Subscriber.aggregatePaginate.mockResolvedValue({ docs: [] });
    const next = vi.fn();
    await list({ query: { search_key: 'a+b@example.com', source: 'web', status: 'subscribed,unsubscribed' }, params: {}, __: s => s }, response(), next);
    expect(Subscriber.aggregate).toHaveBeenCalledWith([{ $match: expect.objectContaining({ deleted_at: null, source: 'web', status: { $in: ['subscribed', 'unsubscribed'] }, $or: [{ email: { $regex: 'a\\+b@example\\.com', $options: 'i' } }, { status: { $regex: 'a\\+b@example\\.com', $options: 'i' } }] }) }]);
    expect(next).not.toHaveBeenCalled();
  });
});
