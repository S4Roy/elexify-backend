import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Order.js', () => ({ default: { findById: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock('../observability/recordOperationalEvent.js', () => ({ recordOperationalEvent: vi.fn() }));
import Order from '../../models/Order.js';
import { transitionOrder } from './transitionOrder.js';
const current = { _id: 'o1', order_status: 'shipped', payment_status: 'advance_paid', shiprocket_status_updated_at: new Date('2026-09-21T10:00:00Z'), package_count: 0 };
beforeEach(() => { vi.resetAllMocks(); Order.findById.mockResolvedValue(current); });
it('rejects a snapshot if another event already advanced the order', async () => {
  await expect(transitionOrder({ orderId: 'o1', orderStatus: 'delivered', expectedState: { order_status: 'packed', payment_status: 'advance_paid' } })).rejects.toMatchObject({ shipmentConflict: true });
  expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
});
it('guards tracking metadata as well as fulfillment and payment state', async () => {
  Order.findOneAndUpdate.mockResolvedValue({ ...current, order_status: 'delivered' });
  await transitionOrder({ orderId: 'o1', orderStatus: 'delivered', expectedState: current });
  expect(Order.findOneAndUpdate.mock.calls[0][0]).toMatchObject({
    order_status: 'shipped', payment_status: 'advance_paid', shiprocket_status_updated_at: current.shiprocket_status_updated_at, package_count: 0,
  });
});
it('reports a concurrent write instead of returning a null order', async () => {
  Order.findOneAndUpdate.mockResolvedValue(null);
  await expect(transitionOrder({ orderId: 'o1', orderStatus: 'delivered', expectedState: current })).rejects.toMatchObject({ shipmentConflict: true });
});
it('rejects legacy reconciliation after packages were added', async () => {
  Order.findById.mockResolvedValue({ ...current, package_count: 1 });
  await expect(transitionOrder({ orderId: 'o1', expectedState: current })).rejects.toMatchObject({ shipmentConflict: true });
});
