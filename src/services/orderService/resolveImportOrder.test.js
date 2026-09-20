import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Order.js', () => ({ default: { find: vi.fn(), findOne: vi.fn() } }));
vi.mock('../../models/Package.js', () => ({ default: { find: vi.fn() } }));
import Order from '../../models/Order.js';
import Package from '../../models/Package.js';
import { resolveImportOrder } from './resolveImportOrder.js';
const result = rows => ({ limit: vi.fn().mockResolvedValue(rows) });
beforeEach(() => { vi.resetAllMocks(); Package.find.mockReturnValue(result([])); Order.find.mockReturnValue(result([])); });
it('matches a suffixed reference through its stored package', async () => {
  Package.find.mockReturnValue(result([{ _id: 'pkg1', order_id: 'local1' }]));
  Order.findOne.mockResolvedValue({ _id: 'local1', id: '10212' });
  expect(await resolveImportOrder('10212-C')).toMatchObject({ order: { id: '10212' }, matchedBy: 'package', packageId: 'pkg1' });
  expect(Package.find).toHaveBeenCalledWith({ $or: [{ shiprocket_order_id: '10212-C' }, { reference_id: '10212-C' }] });
  expect(Order.find).not.toHaveBeenCalled();
});
it('falls back to a stored Shiprocket order ID as the webhook does', async () => {
  Order.find.mockReturnValue(result([{ _id: 'local1', id: '4271', shiprocket_order_id: '5102715758' }]));
  expect(await resolveImportOrder('5102715758')).toMatchObject({ matchedBy: 'shiprocket_order_id', order: { id: '4271' } });
  expect(Order.find).toHaveBeenCalledWith({ deleted_at: null, $or: [{ id: '5102715758' }, { shiprocket_order_id: '5102715758' }] });
});
it('does not guess a base order from suffixes', async () => {
  expect(await resolveImportOrder('7697-REPLACEMENT')).toBeNull();
  expect(Order.find.mock.lastCall[0].$or).toEqual([{ id: '7697-REPLACEMENT' }, { shiprocket_order_id: '7697-REPLACEMENT' }]);
});
it('rejects ambiguous legacy identifiers', async () => {
  Order.find.mockReturnValue(result([{ _id: 'one' }, { _id: 'two' }]));
  await expect(resolveImportOrder('4271')).rejects.toThrow(/Multiple orders/);
});
it('rejects ambiguous packages and missing/deleted package parents', async () => {
  Package.find.mockReturnValue(result([{ _id: 'one' }, { _id: 'two' }]));
  await expect(resolveImportOrder('4271')).rejects.toThrow(/Multiple packages/);
  Package.find.mockReturnValue(result([{ _id: 'one', order_id: 'deleted' }]));
  Order.findOne.mockResolvedValue(null);
  expect(await resolveImportOrder('4271')).toBeNull();
});
