vi.mock('./resolveImportOrder.js', () => ({ resolveImportOrder: vi.fn() }));
import { resolveImportOrder } from './resolveImportOrder.js';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Order.js', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
import Order from '../../models/Order.js';
import { auditForceOrderStatusImport, applyForceOrderStatusRow, fileOrderStatus } from './forceOrderStatusImport.js';
const order = { _id: 'local1', id: '4271', order_status: 'cancelled', payment_status: 'pending', inventory_reverted: true };
beforeEach(() => { vi.resetAllMocks(); Order.findOne.mockResolvedValue(order); resolveImportOrder.mockResolvedValue({ order, matchedBy: 'order_id' }); });
it('previews forced delivery without payment, shipment or lifecycle prerequisites', async () => {
  const { candidates, report } = await auditForceOrderStatusImport([{ 'Order ID': 4271, Status: 'DELIVERED' }]);
  expect(candidates[0]).toMatchObject({ reference: '4271', status: 'delivered', expectedStatus: 'cancelled' });
  expect(report.applied[0]).toMatchObject({ from: 'cancelled', to: 'delivered' });
  expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
});
it('records the actor while changing only the order label', async () => {
  Order.findOneAndUpdate.mockResolvedValue({ ...order, order_status: 'delivered' });
  await applyForceOrderStatusRow({ reference: '4271', orderId: 'local1', status: 'delivered', expectedStatus: 'cancelled', rawStatus: 'DELIVERED' }, 'admin1', 'orders.xlsx');
  const [filter, update] = Order.findOneAndUpdate.mock.lastCall;
  expect(filter).toEqual({ _id: 'local1', id: '4271', deleted_at: null, order_status: 'cancelled' });
  expect(Object.keys(update.$set).sort()).toEqual(['order_status', 'updated_at']);
  expect(update.$push.manual_status_history).toMatchObject({ from: 'cancelled', to: 'delivered', changed_by: 'admin1' });
  expect(update.$push.manual_status_history.reason).toContain('orders.xlsx');
});
it('rejects a stale preview', async () => {
  Order.findOneAndUpdate.mockResolvedValue(null);
  await expect(applyForceOrderStatusRow({ reference: '4271', orderId: 'local1', status: 'delivered', expectedStatus: 'pending' }, 'admin1', 'orders.xlsx')).rejects.toThrow(/changed since preview/);
});
it('rejects conflicting duplicate statuses and skips unknown statuses', async () => {
  const result = await auditForceOrderStatusImport([{ 'Order ID': '1', Status: 'DELIVERED' }, { 'Order ID': '1', Status: 'LOST' }, { 'Order ID': '2', Status: 'unknown' }]);
  expect(result.candidates).toHaveLength(0);
  expect(result.report.counters.order_matched_blocked).toBe(1);
  expect(result.report.counters.unsupported_status).toBe(1);
});
it('reports missing exact IDs without stripping suffixes', async () => {
  resolveImportOrder.mockResolvedValue(null);
  const result = await auditForceOrderStatusImport([{ 'Order ID': '4271-C', Status: 'DELIVERED' }]);
  expect(resolveImportOrder).toHaveBeenCalledWith('4271-C');
  expect(result.report.counters.unmatched).toBe(1);
});
it('maps shipment exceptions without confusing them with customer delivery', () => {
  expect(fileOrderStatus('RTO DELIVERED')).toBe('returned');
  expect(fileOrderStatus('RTO_DELIVERED')).toBe('returned');
  expect(fileOrderStatus('RTO_ACKNOWLEDGED')).toBe('returned');
  expect(fileOrderStatus('LOST')).toBe('failed');
  expect(fileOrderStatus('IN TRANSIT-EN-ROUTE')).toBe('shipped');
  expect(fileOrderStatus('RTO OFD')).toBe('return_requested');
});

it('shows the actual local ID for a Shiprocket reference match', async () => {
  resolveImportOrder.mockResolvedValue({ order, matchedBy: 'shiprocket_order_id' });
  const result = await auditForceOrderStatusImport([{ 'Order ID': '5102715758', Status: 'DELIVERED' }]);
  expect(result.candidates[0]).toMatchObject({ reference: '5102715758', localOrderId: '4271', orderId: 'local1' });
  expect(result.report.applied[0]).toMatchObject({ shiprocket_order_id: '5102715758', order_id: '4271' });
  Order.findOneAndUpdate.mockResolvedValue(order);
  await applyForceOrderStatusRow(result.candidates[0], 'admin1', 'orders.xlsx');
  expect(Order.findOneAndUpdate.mock.lastCall[0].id).toBe('4271');
});
it('blocks a reference reassigned to a different order since preview', async () => {
  resolveImportOrder.mockResolvedValue({ order: { ...order, _id: 'different' } });
  await expect(applyForceOrderStatusRow({ reference: '4271', orderId: 'local1', status: 'delivered' }, 'admin1', 'orders.xlsx')).rejects.toThrow(/reference changed/);
  expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
});
