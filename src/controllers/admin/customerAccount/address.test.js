import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import Address from '../../../models/Address.js';
import User from '../../../models/User.js';
import Country from '../../../models/Country.js';
import State from '../../../models/State.js';
import City from '../../../models/City.js';
import AuditLog from '../../../models/AuditLog.js';
import { editAddress } from './address.js';
import { addressEditSchema } from '../../../validations/admin/customerAccount/address.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { PERMISSIONS } from '../../../constants/adminPermissions.js';
import { assertPincodeServiceable } from '../../../services/shipping/assertPincodeServiceable.js';

vi.mock('../../../services/shipping/assertPincodeServiceable.js', () => ({ assertPincodeServiceable: vi.fn() }));

const input = {
  expected_updated_at: null, full_name: 'Customer Name', phone_code: '91', phone: '9876543210',
  email: '', address_line_1: '22 New Street', address_line_2: '', land_mark: '',
  country: 101, state: 4853, city_name: 'Kolkata', postcode: '700001',
  address_type: 'home', purpose: 'shipping', reason: 'Customer requested a correction',
};
const original = {
  _id: new mongoose.Types.ObjectId(), user: new mongoose.Types.ObjectId(),
  ...input, address_line_1: '11 Original Street', updated_at: null,
  created_at: new Date('2025-01-01'), is_default: true, latitude: 10, longitude: 20,
};
const query = value => ({ lean: async () => value, session: () => ({ lean: async () => value }) });

describe('customer address input and permissions', () => {
  it('accepts a valid correction', () => expect(addressEditSchema.validate(input).error).toBeUndefined());
  it.each([
    { full_name: '' }, { postcode: '000000' }, { phone: '123' }, { reason: 'short' },
    { country: -1 }, { email: 'not-an-email' }, { user: 'another-customer' },
    { is_default: true }, { updated_by: 'forged-admin' }, { expected_updated_at: undefined },
  ])('rejects invalid or protected input %j', change => {
    expect(addressEditSchema.validate({ ...input, ...change }).error).toBeDefined();
  });
  it.each(['superadmin', 'manager', 'staff', 'supervisor', 'operator', 'customer'])('gates %s on the server', role => {
    const next = vi.fn();
    requirePermission(PERMISSIONS.CUSTOMER_ADDRESS_MANAGE)({ auth: { role } }, {}, next);
    if (['superadmin', 'manager'].includes(role)) expect(next).toHaveBeenCalledWith();
    else expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
});

describe('customer address correction', () => {
  let session, req, res, next;
  beforeEach(() => {
    session = { withTransaction: vi.fn(async fn => fn()), endSession: vi.fn() };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    vi.spyOn(Country, 'findOne').mockReturnValue(query({ id: 101, name: 'India' }));
    vi.spyOn(Country, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ phone_code: '+91' }] }) });
    vi.spyOn(State, 'findOne').mockReturnValue(query({ id: 4853, name: 'West Bengal' }));
    vi.spyOn(City, 'findOne').mockReturnValue(query({ id: 123, name: 'Kolkata' }));
    vi.spyOn(User, 'exists').mockReturnValue({ session: async () => ({ _id: original.user }) });
    vi.spyOn(Address, 'findOne').mockReturnValue(query(original));
    vi.spyOn(Address, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(Address, 'create').mockImplementation(async records => [{ ...records[0], _id: new mongoose.Types.ObjectId() }]);
    vi.spyOn(AuditLog, 'create').mockResolvedValue([]);
    assertPincodeServiceable.mockResolvedValue();
    req = { params: { id: String(original.user), addressId: String(original._id) }, body: { ...input },
      auth: { user_id: new mongoose.Types.ObjectId() }, ip: '127.0.0.1', get: () => 'test' };
    res = { json: vi.fn() }; next = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('preserves the original address and writes the replacement and audit in the same transaction', async () => {
    await editAddress(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(Address.findOne).toHaveBeenCalledWith({ _id: req.params.addressId, user: req.params.id, deleted_at: null });
    expect(Address.updateOne.mock.calls[0][1].$set).not.toHaveProperty('address_line_1');
    const replacement = Address.create.mock.calls[0][0][0];
    expect(replacement).not.toHaveProperty('_id');
    expect(replacement).toMatchObject({ address_line_1: '22 New Street', is_default: true,
      user: original.user, latitude: null, longitude: null, country_name: 'India', state_name: 'West Bengal' });
    expect(Address.create.mock.calls[0][1].session).toBe(session);
    expect(AuditLog.create.mock.calls[0][1].session).toBe(session);
    const audit = AuditLog.create.mock.calls[0][0][0];
    expect(audit.actor_id).toBe(req.auth.user_id);
    expect(audit.metadata.before.address_line_1).toBe('11 Original Street');
    expect(audit.metadata.after.address_line_1).toBe('22 New Street');
    expect(session.endSession).toHaveBeenCalled();
  });
  it('rejects another customer’s or archived address', async () => {
    Address.findOne.mockReturnValue(query(null));
    await editAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
    expect(Address.create).not.toHaveBeenCalled();
  });
  it('rejects calling codes not belonging to an active country', async () => {
    req.body.phone_code = '44';
    await editAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(Country.find).toHaveBeenCalledWith({ status: 'active' });
    expect(Address.updateOne).not.toHaveBeenCalled();
  });
  it('rejects stale edits', async () => {
    req.body.expected_updated_at = '2025-03-01';
    await editAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(Address.updateOne).not.toHaveBeenCalled();
  });
  it('rejects a lost concurrent update', async () => {
    Address.updateOne.mockResolvedValue({ modifiedCount: 0 });
    await editAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
    expect(Address.create).not.toHaveBeenCalled();
  });
  it('rejects a state outside the chosen country', async () => {
    State.findOne.mockReturnValue(query(null));
    await editAddress(req, res, next);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(Address.updateOne).not.toHaveBeenCalled();
  });
  it('does not report success when audit persistence fails', async () => {
    AuditLog.create.mockRejectedValue(new Error('Audit unavailable'));
    await editAddress(req, res, next);
    expect(next.mock.calls[0][0].message).toBe('Audit unavailable');
    expect(res.json).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });
});
