import { describe, expect, it } from 'vitest';
import { validateManualPayment } from './validateManualPayment.js';
import { roleHasPermission, PERMISSIONS } from '../../constants/adminPermissions.js';

const order = { payment_status: 'pending', order_status: 'pending', payment_method: 'razorpay',
  grand_total: 123.45, currency: 'INR', created_at: new Date('2025-01-01') };
const payment = { amount: 123.45, currency: 'INR', method: 'upi', reference: 'UTR123',
  received_at: '2025-02-01', reason: 'Verified bank statement', recorded_by: 'admin' };

describe('manual payment safeguards', () => {
  it('accepts verified receipt details', () => expect(() => validateManualPayment(order, payment)).not.toThrow());
  it.each([
    { amount: 123 }, { currency: 'USD' }, { amount: NaN }, { amount: -1 },
    { received_at: '2099-01-01' }, { received_at: '2024-01-01' }, { received_at: 'invalid' },
    { reference: '' }, { reason: undefined }, { recorded_by: null }, { method: 'razorpay' },
  ])('rejects invalid receipt %j', change => {
    expect(() => validateManualPayment(order, { ...payment, ...change })).toThrow();
  });
  it.each([
    { payment_status: 'paid' }, { payment_status: 'refunded' }, { order_status: 'cancelled' },
    { order_status: 'delivered' }, { stock_reserved: true }, { inventory_reverted: true },
    { refund: { status: 'processing' } }, { manual_payment: payment }, { payment_method: 'cod' },
  ])('rejects ineligible order %j', change => {
    expect(() => validateManualPayment({ ...order, ...change }, payment)).toThrow();
  });
  it('records only the partial COD advance', () => {
    const partial = { ...order, payment_method: 'cod', is_partial_cod: true, advance_amount: 20 };
    expect(() => validateManualPayment(partial, { ...payment, amount: 20 })).not.toThrow();
    expect(() => validateManualPayment(partial, payment)).toThrow();
  });
  it('restricts recording to managers and superadmins', () => {
    for (const role of ['manager', 'superadmin']) expect(roleHasPermission(role, PERMISSIONS.ORDER_PAYMENT_MANAGE)).toBe(true);
    for (const role of ['staff', 'operator', 'supervisor', 'customer']) expect(roleHasPermission(role, PERMISSIONS.ORDER_PAYMENT_MANAGE)).toBe(false);
  });
});
