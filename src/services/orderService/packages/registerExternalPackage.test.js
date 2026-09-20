import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../models/Order.js', () => ({ default: { findOne: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../../../models/OrderItem.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../../models/Package.js', () => ({ default: { find: vi.fn(), create: vi.fn() } }));
vi.mock('../../shiprocket/returnShipment.js', () => ({ returnApi: vi.fn() }));
vi.mock('./recomputeOrderStatus.js', () => ({ recomputeOrderStatus: vi.fn() }));
vi.mock('../manualOrderStatus.js', () => ({ applyManualOrderStatusChange: vi.fn() }));
import Order from '../../../models/Order.js';
import OrderItem from '../../../models/OrderItem.js';
import Package from '../../../models/Package.js';
import { returnApi } from '../../shiprocket/returnShipment.js';
import { recomputeOrderStatus } from './recomputeOrderStatus.js';
import { applyManualOrderStatusChange } from '../manualOrderStatus.js';
import { registerExternalPackage } from './registerExternalPackage.js';
const order = { _id: '507f1f77bcf86cd799439011', id: '4271', order_status: 'pending' };
const args = { orderId: order._id, shiprocketOrderId: '999', reason: 'CSV delivery reconciliation', adminId: 'admin1', legacyDeliveredImport: true };
beforeEach(() => {
  vi.resetAllMocks();
  Order.findOne.mockResolvedValue(order);
  OrderItem.find.mockResolvedValue([{ _id: 'item1', quantity: 2 }]);
  Package.find.mockResolvedValue([]);
  Package.create.mockResolvedValue([{ _id: 'package1' }]);
  returnApi.mockResolvedValue({ data: { id: 999, channel_order_id: '4271', shipments: [{ id: 123, current_status: 'DELIVERED', awb: 'AWB123' }] } });
  recomputeOrderStatus.mockResolvedValue({ order: { ...order, order_status: 'delivered' } });
});
it('registers a verified imported shipment before correcting a pending order', async () => {
  await registerExternalPackage(args);
  expect(Package.create).toHaveBeenCalledWith([expect.objectContaining({ reference_id: '4271', shiprocket_order_id: '999', shiprocket_shipment_id: '123', status: 'delivered', awb: 'AWB123', created_by: 'admin1' })]);
  expect(applyManualOrderStatusChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'delivered', changedBy: 'admin1', order }));
  expect(Package.create.mock.invocationCallOrder[0]).toBeLessThan(applyManualOrderStatusChange.mock.invocationCallOrder[0]);
});
it('backfills shipment details for an already delivered imported order', async () => {
  Order.findOne.mockResolvedValue({ ...order, order_status: 'delivered' });
  await registerExternalPackage(args);
  expect(Package.create).toHaveBeenCalled();
  expect(applyManualOrderStatusChange).not.toHaveBeenCalled();
});
it('does not relax the reference check for ordinary manual registration', async () => {
  await expect(registerExternalPackage({ ...args, legacyDeliveredImport: false })).rejects.toThrow(/not linked/);
  expect(Package.create).not.toHaveBeenCalled();
});
it('rejects non-delivered imports before creating a package', async () => {
  returnApi.mockResolvedValue({ data: { id: 999, channel_order_id: '4271', shipments: [{ id: 123, current_status: 'RTO DELIVERED' }] } });
  await expect(registerExternalPackage(args)).rejects.toThrow(/no longer/);
  expect(Package.create).not.toHaveBeenCalled();
});
it('allows verified migrated delivery with pending payment and passes the narrow correction flag', async () => {
  Order.findOne.mockResolvedValue({ ...order, is_migrated: true, legacy_import: { source: 'eqstoxco_wp434' }, payment_method: 'razorpay', payment_status: 'pending' });
  await registerExternalPackage(args);
  expect(applyManualOrderStatusChange).toHaveBeenCalledWith(expect.objectContaining({ historicalDeliveryVerified: true, status: 'delivered' }));
});
it('keeps the payment guard for non-imported unpaid orders', async () => {
  Order.findOne.mockResolvedValue({ ...order, payment_method: 'razorpay', payment_status: 'pending' });
  await expect(registerExternalPackage(args)).rejects.toThrow(/payment/);
  expect(Package.create).not.toHaveBeenCalled();
});
it('refreshes an already-delivered order without requiring a new payment record', async () => {
  Order.findOne.mockResolvedValue({ ...order, order_status: 'delivered', payment_method: 'razorpay', payment_status: 'pending' });
  await registerExternalPackage(args);
  expect(Package.create).toHaveBeenCalled();
  expect(applyManualOrderStatusChange).not.toHaveBeenCalled();
});
