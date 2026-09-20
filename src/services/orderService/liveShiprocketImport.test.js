import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../models/Order.js', () => ({ default: { findOne: vi.fn() } }));
vi.mock('../../models/Package.js', () => ({ default: { findOne: vi.fn(), exists: vi.fn() } }));
vi.mock('../shiprocket/returnShipment.js', () => ({ returnApi: vi.fn() }));
vi.mock('./packages/registerExternalPackage.js', () => ({ registerExternalPackage: vi.fn() }));
vi.mock('./packages/syncShiprocketStatus.js', () => ({ syncShiprocketStatus: vi.fn() }));
import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { returnApi } from '../shiprocket/returnShipment.js';
import { registerExternalPackage } from './packages/registerExternalPackage.js';
import { syncShiprocketStatus } from './packages/syncShiprocketStatus.js';
import { auditLiveShiprocketImport, applyLiveShiprocketRow, verifyDeliveredRemote } from './liveShiprocketImport.js';
const remote = { id: 999, channel_order_id: '4271', channel_name: 'WOOCOMMERCE', shipments: [{ id: 123, current_status: 'DELIVERED', awb: 'AWB123' }] };
const row = { 'Order ID': '4271', Status: 'DELIVERED', Channel: 'WOOCOMMERCE' };
const order = { _id: 'local1', id: '4271', order_status: 'processing' };
const candidate = { reference: '4271', channel: 'WOOCOMMERCE', orderId: 'local1', shiprocketOrderId: '999', packageId: null };
beforeEach(() => {
  vi.resetAllMocks();
  Order.findOne.mockResolvedValue(order);
  Package.findOne.mockResolvedValue(null);
  Package.exists.mockResolvedValue(null);
  syncShiprocketStatus.mockResolvedValue({ results: [] });
  returnApi.mockResolvedValue({ data: [remote], meta: { pagination: { total_pages: 1 } } });
});
describe('live delivered CSV import', () => {
  it('previews imported orders without writes and deduplicates CSV rows', async () => {
    expect((await auditLiveShiprocketImport([row, row])).candidates).toEqual([candidate]);
    expect(registerExternalPackage).not.toHaveBeenCalled();
    expect(syncShiprocketStatus).not.toHaveBeenCalled();
  });
  it('skips returns, lost and in-transit rows without API calls', async () => {
    const result = await auditLiveShiprocketImport(['RTO_DELIVERED', 'RTO DELIVERED', 'LOST', 'IN TRANSIT'].map(Status => ({ ...row, Status })));
    expect(result.candidates).toEqual([]);
    expect(result.report.counters.unsupported_status).toBe(4);
    expect(returnApi).not.toHaveBeenCalled();
  });
  it('reads all pages and rejects ambiguous references', async () => {
    returnApi.mockResolvedValueOnce({ data: [remote], meta: { pagination: { total_pages: 2 } } }).mockResolvedValueOnce({ data: [{ ...remote, id: 1000 }], meta: { pagination: { total_pages: 2 } } });
    const result = await auditLiveShiprocketImport([row]);
    expect(returnApi).toHaveBeenCalledTimes(2);
    expect(result.report.blocked[0].reason).toMatch(/Multiple/);
  });
  it('never treats a channel reference as the internal Shiprocket ID', async () => {
    returnApi.mockResolvedValue({ data: [{ ...remote, id: 4271, channel_order_id: 'other' }], meta: { pagination: { total_pages: 1 } } });
    expect((await auditLiveShiprocketImport([row])).candidates).toEqual([]);
  });
  it('reports missing local orders', async () => {
    Order.findOne.mockResolvedValue(null);
    expect((await auditLiveShiprocketImport([row])).report.counters.unmatched).toBe(1);
  });
  it('rejects channel mismatch, multiple shipments, and live RTO', () => {
    expect(() => verifyDeliveredRemote(remote, '4271', 'CUSTOM')).toThrow(/channel/);
    expect(() => verifyDeliveredRemote({ ...remote, shipments: [...remote.shipments, ...remote.shipments] }, '4271', 'WOOCOMMERCE')).toThrow(/exactly one/);
    expect(() => verifyDeliveredRemote({ ...remote, shipments: [{ id: 123, current_status: 'RTO DELIVERED' }] }, '4271', 'WOOCOMMERCE')).toThrow(/not delivered/);
  });
  it('blocks refunds and unpaid orders before mutation', async () => {
    for (const extra of [{ refund: { status: 'pending' } }, { payment_method: 'razorpay', payment_status: 'pending' }]) {
      Order.findOne.mockResolvedValue({ ...order, ...extra });
      await expect(applyLiveShiprocketRow(candidate, 'admin1')).rejects.toThrow();
    }
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });
  it('links verified imported orders under the acting admin', async () => {
    returnApi.mockResolvedValue({ data: remote });
    await applyLiveShiprocketRow(candidate, 'admin1');
    expect(registerExternalPackage).toHaveBeenCalledWith(expect.objectContaining({ adminId: 'admin1', legacyDeliveredImport: true }));
  });
  it('refreshes linked legacy orders without notifications', async () => {
    Order.findOne.mockResolvedValue({ ...order, shiprocket_order_id: '999' });
    returnApi.mockResolvedValue({ data: remote });
    await applyLiveShiprocketRow(candidate, 'admin1');
    expect(syncShiprocketStatus).toHaveBeenCalledWith(expect.objectContaining({ notify: false, verifiedRemote: remote }));
  });
  it('rechecks delivery before writing', async () => {
    returnApi.mockResolvedValue({ data: { ...remote, shipments: [{ id: 123, current_status: 'IN TRANSIT' }] } });
    await expect(applyLiveShiprocketRow(candidate, 'admin1')).rejects.toThrow(/not delivered/);
    expect(registerExternalPackage).not.toHaveBeenCalled();
  });
});

it('looks up an exact reference when it is absent from the listing', async () => {
  returnApi.mockResolvedValueOnce({ data: [], meta: { pagination: { total_pages: 0 } } }).mockResolvedValueOnce({ data: [remote], meta: { pagination: { total_pages: 1 } } });
  expect((await auditLiveShiprocketImport([row])).candidates).toEqual([candidate]);
  expect(returnApi).toHaveBeenLastCalledWith('GET', 'orders', expect.objectContaining({ filter_by: 'channel_order_id', filter: '4271' }));
});
it('reports channel mismatch separately from a missing reference', async () => {
  const result = await auditLiveShiprocketImport([{ ...row, Channel: 'CUSTOM' }]);
  expect(result.report.blocked[0].reason).toMatch(/Channel mismatch.*WOOCOMMERCE/);
});
it('accepts the downloaded unmatched CSV headers', async () => {
  expect((await auditLiveShiprocketImport([{ shiprocket_order_id: '4271', status: 'DELIVERED', channel: 'WOOCOMMERCE' }])).candidates).toEqual([candidate]);
});
it('uses explicit historical months from the original export', async () => {
  await auditLiveShiprocketImport([{ ...row, 'Shiprocket Created At': '12/31/2024 16:33' }]);
  expect(returnApi).toHaveBeenCalledWith('GET', 'orders', { from: '2024-12-01', to: '2024-12-31', page: 1, per_page: 100 });
});
it('previews migrated orders with missing payment records without changing payment', async () => {
  const historical = { ...order, is_migrated: true, legacy_import: { source: 'eqstoxco_wp434' }, payment_method: 'razorpay', payment_status: 'pending' };
  Order.findOne.mockResolvedValue(historical);
  expect((await auditLiveShiprocketImport([row])).candidates).toHaveLength(1);
  expect(historical.payment_status).toBe('pending');
});
