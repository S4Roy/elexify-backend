import { expect, it, vi } from 'vitest';
vi.mock('../../models/Order.js', () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock('../../models/Package.js', () => ({ default: { find: vi.fn() } }));
import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { applyManualOrderStatusChange } from './manualOrderStatus.js';
const order = { _id: 'order1', order_status: 'processing', shiprocket_order_id: '999', payment_method: 'razorpay', payment_status: 'pending', is_migrated: true, legacy_import: { source: 'eqstoxco_wp434' } };
it('corrects verified historical delivery without recording a payment', async () => {
  Package.find.mockResolvedValue([]);
  Order.findOneAndUpdate.mockResolvedValue({ ...order, order_status: 'delivered' });
  await applyManualOrderStatusChange({ order, status: 'delivered', historicalDeliveryVerified: true, reason: 'Verified historical delivery; payment unchanged', changedBy: 'admin1' });
  const update = Order.findOneAndUpdate.mock.lastCall[1];
  expect(update.$set.order_status).toBe('delivered');
  expect(update.$set).not.toHaveProperty('payment_status');
  expect(update.$set).not.toHaveProperty('paid_at');
  expect(update.$push.manual_status_history.changed_by).toBe('admin1');
});
it('retains the payment guard for an ordinary manual correction', async () => {
  Package.find.mockResolvedValue([]);
  await expect(applyManualOrderStatusChange({ order, status: 'delivered', reason: 'Manual correction', changedBy: 'admin1' })).rejects.toThrow(/payment/);
});
it('retains the payment guard for non-migrated orders even with the internal flag', async () => {
  Package.find.mockResolvedValue([]);
  await expect(applyManualOrderStatusChange({ order: { ...order, is_migrated: false }, status: 'delivered', historicalDeliveryVerified: true, reason: 'Delivery sync', changedBy: 'admin1' })).rejects.toThrow(/payment/);
});
