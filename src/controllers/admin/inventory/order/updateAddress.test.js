import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import Order from '../../../../models/Order.js';
import Address from '../../../../models/Address.js';
import Invoice from '../../../../models/Invoice.js';
import AuditLog from '../../../../models/AuditLog.js';
import { assertOrderAddressEditable, updateAddress } from './updateAddress.js';
import { resolveAddressFields } from '../../customerAccount/address.js';
import { roleHasPermission, PERMISSIONS } from '../../../../constants/adminPermissions.js';

vi.mock('../../customerAccount/address.js', () => ({ resolveAddressFields: vi.fn() }));
const oid = () => new mongoose.Types.ObjectId();

describe('order address eligibility', () => {
  it.each(['pending', 'confirmed', 'processing', 'partially_shipped', 'partially_delivered'])('allows %s before invoice and shipment', order_status => {
    expect(() => assertOrderAddressEditable({ order_status })).not.toThrow();
  });
  it.each([
    { order_status: 'shipped' }, { order_status: 'cancelled' }, { order_status: 'delivered' },
    { order_status: 'packed' }, { order_status: 'returned' }, { inventory_reverted: true },
    { invoice: { generated: true } }, { fully_packed: true }, { awb: 'AWB' },
    { shiprocket_order_id: 'shipment' }, { refund: { status: 'processing' } },
  ])('blocks unsafe corrections %j', change => {
    expect(() => assertOrderAddressEditable({ order_status: 'processing', ...change })).toThrow();
  });
  it('grants managers and superadmins the dedicated permission', () => {
    for (const role of ['manager', 'superadmin']) expect(roleHasPermission(role, PERMISSIONS.ORDER_ADDRESS_MANAGE)).toBe(true);
    for (const role of ['staff', 'supervisor', 'operator', 'customer']) expect(roleHasPermission(role, PERMISSIONS.ORDER_ADDRESS_MANAGE)).toBe(false);
  });
});

describe('order address updates', () => {
  let order, original, req, res, next, session;
  beforeEach(() => {
    const addressId = oid();
    original = { _id: addressId, user: oid(), full_name: 'Original Name', address_line_1: 'Old Street' };
    order = { _id: oid(), id: 'ORD-TEST', user: original.user, order_status: 'processing',
      shipping_address: addressId, billing_address: addressId, updated_at: null, package_count: 0,
      shipping: 40, grand_total: 200, currency: 'INR' };
    session = { withTransaction: vi.fn(async fn => fn()), endSession: vi.fn() };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    vi.spyOn(Order, 'findOne').mockReturnValue({ session: async () => order });
    vi.spyOn(Address, 'findById').mockReturnValue({ session: () => ({ lean: async () => original }) });
    vi.spyOn(Invoice, 'exists').mockReturnValue({ session: async () => null });
    vi.spyOn(Address, 'create').mockImplementation(async records => [{ ...records[0], _id: oid() }]);
    vi.spyOn(Order, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(AuditLog, 'create').mockResolvedValue([]);
    resolveAddressFields.mockResolvedValue({ country_name: 'India', state_name: 'West Bengal', city: null });
    req = { body: { order_id: String(order._id), address_kind: 'shipping',
      expected_address_id: String(addressId), expected_updated_at: null,
      reason: 'Customer requested correction', charges_confirmed: true, full_name: 'New Name',
      address_line_1: 'New Street', city_name: 'Kolkata', postcode: '700001', purpose: 'shipping' },
      auth: { user_id: oid() }, ip: '127.0.0.1', get: () => 'test' };
    res = { json: vi.fn() }; next = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  it.each(['shipping', 'billing'])('isolates the %s correction and updates its snapshot', async kind => {
    req.body.address_kind = kind;
    await updateAddress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    const replacement = Address.create.mock.calls[0][0][0];
    expect(replacement).toMatchObject({ is_default: false, purpose: kind, address_type: kind, full_name: 'New Name' });
    expect(replacement.deleted_at).toBeInstanceOf(Date);
    expect(replacement).not.toHaveProperty('_id');
    const update = Order.updateOne.mock.calls[0][1].$set;
    expect(update[`${kind}_address_snapshot`].address_line_1).toBe('New Street');
    expect(Object.keys(update).sort()).toEqual([`${kind}_address`, `${kind}_address_snapshot`, 'updated_at'].sort());
    expect(update).not.toHaveProperty('shipping');
    expect(update).not.toHaveProperty('grand_total');
    expect(original.address_line_1).toBe('Old Street');
    const audit = AuditLog.create.mock.calls[0][0][0];
    expect(audit.metadata).toMatchObject({ address_kind: kind, charges_confirmed: true, shipping: 40, grand_total: 200 });
    expect(audit.actor_id).toBe(req.auth.user_id);
    expect(AuditLog.create.mock.calls[0][1].session).toBe(session);
    expect(Order.updateOne.mock.calls[0][2].session).toBe(session);
  });
  it.each(['address', 'timestamp'])('rejects stale %s', async field => {
    if (field === 'address') req.body.expected_address_id = String(oid());
    else req.body.expected_updated_at = '2025-01-01';
    await updateAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(Address.create).not.toHaveBeenCalled();
  });
  it('blocks an existing invoice even when the order flags are stale', async () => {
    Invoice.exists.mockReturnValue({ session: async () => ({ _id: oid() }) });
    await updateAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(Address.create).not.toHaveBeenCalled();
  });
  it.each(['processing', 'partially_shipped', 'partially_delivered'])('allows address edits for %s with partially packed items', async status => {
    order.order_status = status;
    order.package_count = 1;
    order.fully_packed = false;
    await updateAddress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    expect(Order.updateOne.mock.calls[0][0]).toMatchObject({ fully_packed: { $ne: true } });
    expect(Order.updateOne.mock.calls[0][0]).not.toHaveProperty('package_count');
  });
  it('rejects a fully packed order before creating an address', async () => {
    order.fully_packed = true;
    await updateAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(Address.create).not.toHaveBeenCalled();
  });
  it('rejects a concurrent modification', async () => {
    Order.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await updateAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(AuditLog.create).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
  it('fails the transaction if the audit cannot be saved', async () => {
    AuditLog.create.mockRejectedValue(new Error('Audit failed'));
    await updateAddress(req, res, next);
    expect(next.mock.calls[0][0].message).toBe('Audit failed');
    expect(res.json).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});
