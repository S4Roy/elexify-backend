import { beforeEach, describe, expect, it, vi } from 'vitest';
import { booksRequest } from './booksRequest.js';
import { createCustomer } from './createCustomer.js';
import { customerPayload, disambiguatedContactName, isDuplicateContactName } from './customerPayload.js';

vi.mock('./booksRequest.js', async importOriginal => ({ ...await importOriginal(), booksRequest: vi.fn() }));
vi.mock('../../models/ZohoConnection.js', () => ({ default: { findOne: vi.fn().mockResolvedValue(null) } }));
beforeEach(() => vi.resetAllMocks());

describe('Zoho customer synchronization', () => {
  const payload = { contact_name: 'Elexify customer-123' };
  const contact = { contact_id: 'contact-123', contact_name: payload.contact_name, contact_type: 'customer', status: 'active' };
  it('uses contact persons and preserves invoice snapshot location strings', () => {
    const result = customerPayload({ name: 'Sample Buyer', email: 'buyer@example.test' }, {
      billing_address: { city: 'Kolkata', state: 'West Bengal', country: 'India', address_line_1: 'Street 1' },
    }, 'customer-123');
    expect(result.contact_persons[0]).toMatchObject({ first_name: 'Sample', last_name: 'Buyer', email: 'buyer@example.test', is_primary_contact: true });
    expect(result).not.toHaveProperty('email');
    expect(result.billing_address).toMatchObject({ city: 'Kolkata', state: 'West Bengal', country: 'India' });
    // Zoho shows the customer's name; the stable identity lives in the notes.
    expect(result.contact_name).toBe('Sample Buyer');
    expect(result.notes).toBe('Sample Buyer — Elexify customer customer-123');
  });
  it('supports guest customers and stable identity across name changes', () => {
    expect(customerPayload(null, { billing_address: { full_name: 'Guest Buyer' } }, 'order-1').contact_persons[0].first_name).toBe('Guest');
    const renamed = customerPayload({ name: 'Changed Name' }, {}, 'customer-123');
    expect(renamed.contact_name).toBe('Changed Name');
    expect(renamed.notes).toMatch(/ — Elexify customer customer-123$/);
  });
  it('recognises Zoho duplicate-name rejections', () => {
    expect(isDuplicateContactName({ detail: { zoho_code: 3062 } })).toBe(true);
    expect(isDuplicateContactName({ detail: { zoho_code: 4, message: 'The contact "Om Sah" already exists.' } })).toBe(true);
    expect(isDuplicateContactName({ detail: { zoho_code: 4, message: 'Invalid value passed for place_of_contact' } })).toBe(false);
    expect(isDuplicateContactName(new Error('Timeout'))).toBe(false);
  });
  it('builds a stable distinguishable name for a clashing contact', () => {
    expect(disambiguatedContactName('Om Sah', 'order-ORD-000152')).toBe('Om Sah (ORD-000152)');
    expect(disambiguatedContactName('Om Sah', '64f1c2a9b8e7d6c5b4a3f2e1')).toBe('Om Sah (#a3f2e1)');
  });
  it('reuses an existing exact customer instead of creating a duplicate', async () => {
    booksRequest.mockResolvedValueOnce({ contacts: [contact] });
    expect((await createCustomer(payload, { recoverExisting: true })).data.contact.contact_id).toBe('contact-123');
    expect(booksRequest).toHaveBeenCalledTimes(1);
  });
  it('recovers a provider success after a timed-out create', async () => {
    booksRequest.mockResolvedValueOnce({ contacts: [] }).mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ contacts: [contact] });
    expect((await createCustomer(payload, { recoverExisting: true })).success).toBe(true);
    expect(booksRequest.mock.calls.filter(call => call[0] === 'POST')).toHaveLength(1);
  });
  it('does not merge customers with only similar names', async () => {
    booksRequest.mockResolvedValueOnce({ contacts: [{ ...contact, contact_name: 'Other customer' }] })
      .mockResolvedValueOnce({ contact });
    expect((await createCustomer(payload, { recoverExisting: true })).success).toBe(true);
    expect(booksRequest.mock.calls[1][0]).toBe('POST');
  });
  it('surfaces provider errors instead of a generic failure', async () => {
    booksRequest.mockRejectedValueOnce(new Error('Invalid organization (code 1001)'));
    expect((await createCustomer(payload)).error).toContain('Invalid organization');
  });
});
