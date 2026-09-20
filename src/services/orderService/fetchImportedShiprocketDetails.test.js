import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Order.js', () => ({ default: { exists: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../../models/Package.js', () => ({ default: { findOne: vi.fn(), exists: vi.fn(), updateOne: vi.fn() } }));
vi.mock('./resolveImportOrder.js', () => ({ resolveImportOrder: vi.fn() }));
vi.mock('./liveShiprocketImport.js', () => ({ findRemoteReference: vi.fn(), importDateWindows: vi.fn(() => ([{}])), normalizeImportRows: rows => rows }));
vi.mock('../shiprocket/returnShipment.js', () => ({ returnApi: vi.fn() }));
import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { resolveImportOrder } from './resolveImportOrder.js';
import { findRemoteReference } from './liveShiprocketImport.js';
import { returnApi } from '../shiprocket/returnShipment.js';
import { fetchImportedShiprocketDetails } from './fetchImportedShiprocketDetails.js';
const order = { _id: 'local1', id: '4271', order_status: 'delivered', payment_status: 'pending' };
const remote = { id: 999, channel_order_id: '4271', channel_name: 'CUSTOM', status: 'IN TRANSIT', shipments: [{ id: 123, awb: 'AWB1', courier_name: 'Courier', etd: '2026-10-01' }] };
const args = { candidate: { orderId: 'local1', reference: '4271' }, rows: [{ 'Order ID': '4271', Channel: 'CUSTOM' }], adminId: 'admin1' };
beforeEach(() => {
  vi.resetAllMocks();
  resolveImportOrder.mockResolvedValue({ order });
  findRemoteReference.mockResolvedValue([remote]);
  returnApi.mockResolvedValue({ data: remote });
  Order.updateOne.mockResolvedValue({ matchedCount: 1 });
  Package.updateOne.mockResolvedValue({ matchedCount: 1 });
});
it('saves verified IDs, courier and AWB without changing force status or payment', async () => {
  await fetchImportedShiprocketDetails(args);
  const update = Order.updateOne.mock.lastCall[1];
  expect(update.$set).toEqual({ shiprocket_order_id: '999', shiprocket_shipment_id: '123', awb: 'AWB1', courier_name: 'Courier', etd: '2026-10-01' });
  expect(update.$set).not.toHaveProperty('order_status');
  expect(update.$set).not.toHaveProperty('payment_status');
  expect(update.$push.manual_status_history).toMatchObject({ from: 'delivered', to: 'delivered', changed_by: 'admin1' });
});
it('uses the existing Shiprocket ID for an already linked order', async () => {
  resolveImportOrder.mockResolvedValue({ order: { ...order, shiprocket_order_id: '999' } });
  await fetchImportedShiprocketDetails(args);
  expect(findRemoteReference).not.toHaveBeenCalled();
  expect(returnApi).toHaveBeenCalledWith('GET', 'orders/show/999');
});
it('updates only the matched package', async () => {
  resolveImportOrder.mockResolvedValue({ order, packageId: 'pkg1' });
  Package.findOne.mockResolvedValue({ _id: 'pkg1', order_id: 'local1', reference_id: '4271', status: 'shipped', shiprocket_order_id: '999' });
  await fetchImportedShiprocketDetails(args);
  expect(Order.updateOne).not.toHaveBeenCalled();
  expect(Package.updateOne.mock.lastCall[1].$set).not.toHaveProperty('status');
  expect(Package.updateOne.mock.lastCall[1].$push.timeline.raw.changed_by).toBe('admin1');
});
it('blocks ambiguous remote matches', async () => {
  findRemoteReference.mockResolvedValue([remote, { ...remote, id: 998 }]);
  await expect(fetchImportedShiprocketDetails(args)).rejects.toThrow(/Multiple/);
  expect(Order.updateOne).not.toHaveBeenCalled();
});
it('rejects mismatched remote identity and channel', async () => {
  for (const changes of [{ channel_order_id: 'unrelated' }, { channel_name: 'OTHER' }, { id: 1000 }]) {
    returnApi.mockResolvedValue({ data: { ...remote, ...changes } });
    await expect(fetchImportedShiprocketDetails(args)).rejects.toThrow();
  }
  expect(Order.updateOne).not.toHaveBeenCalled();
});
it('blocks details linked to a different order', async () => {
  Order.exists.mockResolvedValue({ _id: 'other' });
  await expect(fetchImportedShiprocketDetails(args)).rejects.toThrow(/already linked/);
  expect(Order.updateOne).not.toHaveBeenCalled();
});
it('does not erase known metadata when the provider omits it', async () => {
  returnApi.mockResolvedValue({ data: { ...remote, shipments: [{ id: 123 }] } });
  await fetchImportedShiprocketDetails(args);
  expect(Order.updateOne.mock.lastCall[1].$set).toEqual({ shiprocket_order_id: '999', shiprocket_shipment_id: '123' });
});
it('detects a concurrent change instead of reporting success', async () => {
  Order.updateOne.mockResolvedValue({ matchedCount: 0 });
  await expect(fetchImportedShiprocketDetails(args)).rejects.toThrow(/changed during sync/);
});
