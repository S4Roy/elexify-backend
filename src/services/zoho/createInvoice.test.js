import { beforeEach, expect, it, vi } from 'vitest';
import { booksRequest } from './booksRequest.js';
import { createInvoice } from './createInvoice.js';

vi.mock('./booksRequest.js', async importOriginal => ({ ...await importOriginal(), booksRequest: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('preserves the original invoice date and number during a later sync', async () => {
  booksRequest.mockResolvedValue({ invoice: { invoice_id: 'invoice-1' } });
  expect((await createInvoice({ invoice_number: 'ELX-123', date: '2025-01-01', customer_id: 'contact-1' })).success).toBe(true);
  expect(booksRequest).toHaveBeenCalledWith('POST', 'invoices', {
    params: { ignore_auto_number_generation: true },
    data: { invoice_number: 'ELX-123', date: '2025-01-01', customer_id: 'contact-1' },
  });
});

it('returns the provider error for administrative reconciliation', async () => {
  booksRequest.mockRejectedValue(new Error('Invoice number already exists'));
  expect((await createInvoice({ customer_id: 'contact-1' })).error).toBe('Invoice number already exists');
});
