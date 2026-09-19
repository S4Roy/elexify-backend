import Address from '../../../../models/Address.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../site/inventory/order/add.js', () => ({ add: vi.fn() }));
import { add as checkout } from '../../../site/inventory/order/add.js';
import { add, loadAdminItems, createOptions } from './add.js';
import Product from '../../../../models/Product.js';
import ProductVariation from '../../../../models/ProductVariation.js';
import User from '../../../../models/User.js';
import { adminOrderSchema } from '../../../../validations/admin/inventory/order/place.js';
import { PERMISSIONS, roleHasPermission } from '../../../../constants/adminPermissions.js';

beforeEach(() => vi.restoreAllMocks());
describe('admin order access and input', () => {
  it('limits creation to superadmin and manager', () => {
    for (const role of ['superadmin', 'manager']) expect(roleHasPermission(role, PERMISSIONS.ORDER_CREATE)).toBe(true);
    for (const role of ['staff', 'supervisor', 'operator', 'customer']) expect(roleHasPermission(role, PERMISSIONS.ORDER_CREATE)).toBe(false);
  });
  it('rejects supplied prices and invalid quantities', () => {
    const body = { customer_id: 'a'.repeat(24), address_id: 'b'.repeat(24), payment_method: 'cod', idempotency_key: '550e8400-e29b-41d4-a716-446655440000', expected_total: 100, items: [{ product_id: 'c'.repeat(24), quantity: 1 }] };
    expect(adminOrderSchema.validate(body).error).toBeUndefined();
    expect(adminOrderSchema.validate({ ...body, shipping: 0 }).error).toBeDefined();
    expect(adminOrderSchema.validate({ ...body, items: [{ ...body.items[0], quantity: 0 }] }).error).toBeDefined();
    expect(adminOrderSchema.validate({ ...body, items: [{ ...body.items[0], unit_price: 1 }] }).error).toBeDefined();
  });
  it('uses the selected customer and records the actual admin without changing request identity', async () => {
    vi.spyOn(User, 'findOne').mockResolvedValue({ _id: 'customer' });
    const req = { auth: { user_id: 'admin', role: 'manager' }, body: { customer_id: 'customer', idempotency_key: 'key', items: [] }, path: '/place' };
    await add(req, {}, vi.fn());
    const [forwarded, , , context] = checkout.mock.calls.at(-1);
    expect(forwarded.auth.user_id).toBe('customer');
    expect(forwarded.body.idempotency_key).toBe('admin:key');
    expect(context.actor).toBe('admin');
    expect(req.auth.user_id).toBe('admin');
  });
});
describe('catalogue selection', () => {
  it('rejects duplicate lines that could bypass quantity checks', async () => {
    vi.spyOn(Product, 'findOne').mockResolvedValue({ _id: 'p', type: 'simple' });
    await expect(loadAdminItems([{ product_id: 'p', quantity: 1 }, { product_id: 'p', quantity: 2 }])).rejects.toThrow('Combine duplicate');
  });
  it('requires a valid variation belonging to the product', async () => {
    vi.spyOn(Product, 'findOne').mockResolvedValue({ _id: 'p', type: 'variable' });
    vi.spyOn(ProductVariation, 'findOne').mockResolvedValue(null);
    await expect(loadAdminItems([{ product_id: 'p', variation_id: 'wrong', quantity: 1 }])).rejects.toThrow('variation');
    expect(ProductVariation.findOne).toHaveBeenCalledWith(expect.objectContaining({ product_id: 'p', _id: 'wrong' }));
  });
  it('rejects unavailable products', async () => {
    vi.spyOn(Product, 'findOne').mockResolvedValue(null);
    await expect(loadAdminItems([{ product_id: 'p', quantity: 1 }])).rejects.toThrow('no longer available');
  });
});

describe('paginated order lookups', () => {
  const query = records => {
    const chain = { select: vi.fn(), sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), lean: vi.fn().mockResolvedValue(records) };
    for (const key of ['select', 'sort', 'skip', 'limit']) chain[key].mockReturnValue(chain);
    return chain;
  };
  it('paginates customers with stable sorting and literal search', async () => {
    const chain = query([{ _id: 'customer', name: 'A.*' }]);
    vi.spyOn(User, 'find').mockReturnValue(chain);
    vi.spyOn(User, 'countDocuments').mockResolvedValue(41);
    const res = { json: vi.fn() }, next = vi.fn();
    await createOptions({ query: { kind: 'customers', search: 'A.*', page: 2, limit: 20 } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(chain.skip).toHaveBeenCalledWith(20);
    expect(chain.limit).toHaveBeenCalledWith(20);
    expect(chain.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    const filter = User.find.mock.calls[0][0];
    expect(filter.$or[0].name.test('A.*')).toBe(true);
    expect(filter.$or[0].name.test('Alice')).toBe(false);
    expect(User.countDocuments).toHaveBeenCalledWith(filter);
    expect(res.json.mock.calls[0][0].pagination).toEqual({ page: 2, limit: 20, total: 41, has_more: true });
  });
  it('scopes address search and count to the chosen customer', async () => {
    const chain = query([]);
    vi.spyOn(Address, 'find').mockReturnValue(chain);
    vi.spyOn(Address, 'countDocuments').mockResolvedValue(0);
    const res = { json: vi.fn() }, next = vi.fn();
    await createOptions({ query: { customer_id: 'customer', search: '700001' } }, res, next);
    const filter = Address.find.mock.calls[0][0];
    expect(filter).toMatchObject({ user: 'customer', deleted_at: null, status: 'active' });
    expect(filter.$or.some(field => field.postcode?.test('700001'))).toBe(true);
    expect(Address.countDocuments).toHaveBeenCalledWith(filter);
    expect(res.json.mock.calls[0][0].pagination.has_more).toBe(false);
  });
});
