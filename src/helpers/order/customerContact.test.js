import { describe, expect, it } from 'vitest';
import { customerContact } from './customerContact.js';
describe('historical order customer display', () => {
  it('shows guest billing contact without creating an account link', () => {
    expect(customerContact({ customer_account_expected: false, billing_address_snapshot: { full_name: 'Guest Buyer', email: 'guest@example.test', phone: '123' } })).toEqual({ account_status: 'guest', name: 'Guest Buyer', email: 'guest@example.test', phone: '123', phone_code: null });
  });
  it('distinguishes a broken account reference from guest checkout', () => {
    expect(customerContact({ customer_account_expected: true }).account_status).toBe('unavailable');
    expect(customerContact({ user: { _id: 'account' } }).account_status).toBe('linked');
  });
  it('uses shipping details when billing contact is absent and handles empty snapshots', () => {
    expect(customerContact({ billing_address_snapshot: {}, shipping_address_snapshot: { full_name: 'Recipient' } }).name).toBe('Recipient');
    expect(customerContact({}).name).toBeNull();
  });
});
