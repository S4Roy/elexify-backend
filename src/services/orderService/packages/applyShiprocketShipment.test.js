import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../models/Package.js', () => ({ default: { findOneAndUpdate: vi.fn(), findById: vi.fn(), exists: vi.fn() } }));
vi.mock('../../../models/Order.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../transitionOrder.js', () => ({ transitionOrder: vi.fn() }));
import Package from '../../../models/Package.js';
import { transitionOrder } from '../transitionOrder.js';
import { applyPackageShipment, applyLegacyShipment, selectRemoteShipment } from './applyShiprocketShipment.js';
const at = new Date('2026-09-21T10:00:00Z');
const pkg = { _id: 'p1', status: 'packed', timeline: [], shiprocket_order_id: '100' };
beforeEach(() => { vi.resetAllMocks(); Package.exists.mockResolvedValue(null); });

describe('exact remote shipment selection', () => {
  const remote = { id: 100, shipments: [{ id: 1, awb: 'OLD' }, { id: 2, awb: 'CURRENT' }] };
  it('selects by shipment ID instead of array position', () => {
    expect(selectRemoteShipment(remote, { ...pkg, shiprocket_shipment_id: '2' }).awb).toBe('CURRENT');
  });
  it('selects by AWB when no shipment ID is stored', () => {
    expect(selectRemoteShipment(remote, { ...pkg, awb: 'CURRENT' }).id).toBe(2);
  });
  it('rejects ambiguous, missing, and mismatched identities', () => {
    expect(() => selectRemoteShipment(remote, pkg)).toThrow('Multiple shipments');
    expect(() => selectRemoteShipment(remote, { ...pkg, shiprocket_shipment_id: '3' })).toThrow('not uniquely');
    expect(() => selectRemoteShipment(remote, { ...pkg, shiprocket_order_id: 'other' })).toThrow('different order');
  });
});

describe('shared package writes', () => {
  it('rejects older events including their AWB and courier', async () => {
    const result = await applyPackageShipment({ pkg: { ...pkg, shiprocket_status_updated_at: new Date(at.valueOf() + 1000) }, at,
      shipment: { current_status: 'Delivered', awb: 'OLD' } });
    expect(result.outcome).toBe('stale');
    expect(Package.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('does not overwrite a later fulfillment stage with an older snapshot', async () => {
    const result = await applyPackageShipment({ pkg: { ...pkg, status: 'delivered', awb: 'CURRENT' }, at,
      shipment: { current_status: 'Shipped', awb: 'OLD' } });
    expect(result.changed).toBe(false);
    expect(Package.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('keeps existing metadata when incoming fields are empty and writes the shipment ID', async () => {
    Package.findOneAndUpdate.mockResolvedValue({ ...pkg, shiprocket_shipment_id: '2' });
    await applyPackageShipment({ pkg, at, shipment: { id: 2, awb: '', courier_name: null, current_status: 'AWB Assigned' } });
    const [filter, update] = Package.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ status: 'packed', shiprocket_status_updated_at: null });
    expect(update.$set.shiprocket_shipment_id).toBe('2');
    expect(update.$set).not.toHaveProperty('awb');
    expect(update.$set).not.toHaveProperty('courier_name');
    expect(update).not.toHaveProperty('$push');
  });
  it('re-reads after a concurrent update and never regresses or duplicates its timeline', async () => {
    Package.findOneAndUpdate.mockResolvedValue(null);
    Package.findById.mockResolvedValue({ ...pkg, status: 'delivered', shiprocket_status_updated_at: new Date(at.valueOf() + 1) });
    const result = await applyPackageShipment({ pkg, at, shipment: { current_status: 'Shipped' } });
    expect(result.outcome).toBe('stale');
    expect(Package.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
  it('preserves cancelled packages even when the carrier reports delivery', async () => {
    Package.findOneAndUpdate.mockResolvedValue({ ...pkg, status: 'cancelled' });
    await applyPackageShipment({ pkg: { ...pkg, status: 'cancelled' }, at, shipment: { current_status: 'Delivered' } });
    expect(Package.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('status');
  });
  it('keeps fulfillment unchanged for a parent with return/refund effects', async () => {
    Package.findOneAndUpdate.mockResolvedValue(pkg);
    await applyPackageShipment({ pkg, at, allowTransition: false, shipment: { current_status: 'Delivered', awb: 'A' } });
    expect(Package.findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('status');
    expect(Package.findOneAndUpdate.mock.calls[0][1].$set.awb).toBe('A');
  });
});

describe('legacy shipment writes', () => {
  it('updates tracking and completes an advance only on delivery', async () => {
    const order = { _id: 'o1', order_status: 'shipped', payment_status: 'advance_paid', payment_method: 'cod' };
    transitionOrder.mockResolvedValue({ ...order, order_status: 'delivered', payment_status: 'paid' });
    const result = await applyLegacyShipment({ order, at, shipment: { current_status: 'Delivered', awb: 'A' } });
    expect(transitionOrder).toHaveBeenCalledWith(expect.objectContaining({ orderStatus: 'delivered', paymentStatus: 'paid',
      set: expect.objectContaining({ awb: 'A' }), expectedState: expect.objectContaining({ shiprocket_status_updated_at: null }) }));
    expect(result.statusChanged).toBe(true);
  });
  it('refuses the legacy path when packages exist', async () => {
    Package.exists.mockResolvedValue({ _id: 'p1' });
    await expect(applyLegacyShipment({ order: { _id: 'o1' }, shipment: {} })).rejects.toThrow('has packages');
    expect(transitionOrder).not.toHaveBeenCalled();
  });
});
