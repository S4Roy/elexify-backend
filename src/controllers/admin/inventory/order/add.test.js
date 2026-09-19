import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../site/inventory/order/add.js', () => ({ add: vi.fn() }));
import { add as checkout } from '../../../site/inventory/order/add.js';
import { add, loadAdminItems } from './add.js';
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
