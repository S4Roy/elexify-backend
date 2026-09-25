import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Order.js', () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock('../../models/Package.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../notification/sendOrderNotification.js', () => ({ sendOrderNotification: vi.fn() }));
import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { sendOrderNotification } from '../notification/sendOrderNotification.js';
import { applyManualOrderStatusChange } from './manualOrderStatus.js';

const confirmedAt = new Date('2026-09-01T10:00:00Z');
const order = { _id: 'order1', id: 'ORD-1', order_status: 'confirmed', payment_method: 'razorpay', payment_status: 'paid', confirmed_at: confirmedAt };

describe('manual processing step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Package.find.mockResolvedValue([]);
    Order.findOneAndUpdate.mockImplementation(async (_filter, update) => ({ ...order, ...update.$set }));
  });

  it('stamps processing_at, keeps confirmed_at and notifies the customer', async () => {
    await applyManualOrderStatusChange({ order, status: 'processing', reason: 'Picking started', changedBy: 'admin1' });
    const update = Order.findOneAndUpdate.mock.lastCall[1];
    expect(update.$set.confirmed_at).toBe(confirmedAt);
    expect(update.$set.processing_at).toBeInstanceOf(Date);
    expect(sendOrderNotification).toHaveBeenCalledWith(expect.objectContaining({ event: 'ORDER_PROCESSING', dedupeKey: 'ORD-1:ORDER_PROCESSING' }));
  });

  it('stamps confirmed_at when an admin confirms a pending order, without notifying', async () => {
    const pending = { ...order, order_status: 'pending', payment_method: 'cod', confirmed_at: null };
    await applyManualOrderStatusChange({ order: pending, status: 'confirmed', reason: 'Verified by phone', changedBy: 'admin1' });
    const update = Order.findOneAndUpdate.mock.lastCall[1];
    expect(update.$set.confirmed_at).toBeInstanceOf(Date);
    expect(update.$set.processing_at).toBeNull();
    expect(sendOrderNotification).not.toHaveBeenCalled();
  });
});
