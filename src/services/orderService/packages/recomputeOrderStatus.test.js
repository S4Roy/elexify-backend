import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../models/Order.js', () => ({ default: { findById: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../../../models/OrderItem.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../models/Package.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../transitionOrder.js', () => ({ transitionOrder: vi.fn() }));
import Order from '../../../models/Order.js';
import OrderItem from '../../../models/OrderItem.js';
import Package from '../../../models/Package.js';
import { transitionOrder } from '../transitionOrder.js';
import { recomputeOrderStatus } from './recomputeOrderStatus.js';
const order = { _id: 'o1', order_status: 'packed', payment_method: 'cod', payment_status: 'advance_paid' };
const packageFor = (status, quantity = 1) => ({ status, items: [{ order_item_id: 'i1', quantity }] });
beforeEach(() => {
  vi.resetAllMocks();
  Order.findById.mockResolvedValue(order);
  OrderItem.find.mockResolvedValue([{ _id: 'i1', quantity: 2 }]);
  transitionOrder.mockImplementation(async ({ orderStatus, paymentStatus }) => ({ ...order, order_status: orderStatus, payment_status: paymentStatus || order.payment_status }));
});
it('keeps a split delivery partially delivered and its COD advance unpaid', async () => {
  Package.find.mockResolvedValue([packageFor('delivered'), packageFor('packed')]);
  const result = await recomputeOrderStatus({ orderId: 'o1', source: 'carrier' });
  expect(result.order.order_status).toBe('partially_delivered');
  expect(result.order.payment_status).toBe('advance_paid');
});
it('completes delivery and COD only when all ordered quantities are delivered', async () => {
  Package.find.mockResolvedValue([packageFor('delivered'), packageFor('delivered')]);
  const result = await recomputeOrderStatus({ orderId: 'o1', source: 'carrier' });
  expect(result.order.order_status).toBe('delivered');
  expect(result.order.payment_status).toBe('paid');
});
it('marks full COD paid on carrier delivery and awaits the remittance', async () => {
  const fullCod = { ...order, payment_status: 'pending', is_partial_cod: false, grand_total: 1200 };
  Order.findById.mockResolvedValue(fullCod);
  Package.find.mockResolvedValue([packageFor('delivered'), packageFor('delivered')]);
  await recomputeOrderStatus({ orderId: 'o1', source: 'carrier' });
  expect(transitionOrder).toHaveBeenCalledWith(expect.objectContaining({ orderStatus: 'delivered', paymentStatus: 'paid',
    set: expect.objectContaining({ cod_remittance: expect.objectContaining({ status: 'awaiting', expected_amount: 1200 }) }) }));
});
it('leaves full COD unpaid for an admin-driven recompute', async () => {
  Order.findById.mockResolvedValue({ ...order, payment_status: 'pending', grand_total: 1200 });
  Package.find.mockResolvedValue([packageFor('delivered'), packageFor('delivered')]);
  await recomputeOrderStatus({ orderId: 'o1', source: 'application' });
  expect(transitionOrder.mock.calls[0][0].paymentStatus).toBeUndefined();
});
it('does not treat unallocated quantities as delivered', async () => {
  Package.find.mockResolvedValue([packageFor('delivered')]);
  const result = await recomputeOrderStatus({ orderId: 'o1', source: 'carrier' });
  expect(result.order.order_status).toBe('partially_delivered');
});
it('preserves refund and cancellation effects', async () => {
  Order.findById.mockResolvedValue({ ...order, order_status: 'cancelled', inventory_reverted: true });
  Package.find.mockResolvedValue([packageFor('delivered', 2)]);
  await recomputeOrderStatus({ orderId: 'o1', source: 'carrier' });
  expect(transitionOrder).not.toHaveBeenCalled();
});
it('does not complete payment for returned packages', async () => {
  Package.find.mockResolvedValue([packageFor('returned', 2)]);
  await recomputeOrderStatus({ orderId: 'o1', source: 'carrier' });
  expect(transitionOrder.mock.calls[0][0].paymentStatus).toBeUndefined();
});
it('recomputes after a concurrent order transition instead of duplicating a notification', async () => {
  Package.find.mockResolvedValue([packageFor('delivered', 2)]);
  transitionOrder.mockRejectedValueOnce(Object.assign(new Error('Concurrent change'), { shipmentConflict: true }));
  Order.findById.mockResolvedValueOnce(order).mockResolvedValue({ ...order, order_status: 'delivered', payment_status: 'paid' });
  const result = await recomputeOrderStatus({ orderId: 'o1', source: 'carrier' });
  expect(result.statusChanged).toBe(false);
  expect(transitionOrder).toHaveBeenCalledTimes(1);
});
