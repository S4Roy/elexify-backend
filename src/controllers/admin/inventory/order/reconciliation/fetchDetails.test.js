import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../../../models/ShiprocketReconciliationAudit.js', () => ({ default: { findOneAndUpdate: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../../../../../services/orderService/fetchImportedShiprocketDetails.js', () => ({ fetchImportedShiprocketDetails: vi.fn() }));
import Audit from '../../../../../models/ShiprocketReconciliationAudit.js';
import { fetchImportedShiprocketDetails } from '../../../../../services/orderService/fetchImportedShiprocketDetails.js';
import { fetchDetails } from './fetchDetails.js';
const req = { body: { audit_id: 'audit1' }, auth: { user_id: 'admin1' } };
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => { vi.resetAllMocks(); Audit.updateOne.mockResolvedValue({ matchedCount: 1 }); });
it('only fetches candidates whose forced status update succeeded', async () => {
  const candidate = { reference: '2' };
  Audit.findOneAndUpdate.mockResolvedValue({ _id: 'audit1', candidates: [{ reference: '1' }, candidate], outcomes: [{ reference: '1', status: 'blocked' }, { reference: '2', status: 'synced' }], rows: [] });
  fetchImportedShiprocketDetails.mockResolvedValue({ shiprocket_order_id: '999', awb: 'AWB1' });
  const response = res();
  await fetchDetails(req, response, vi.fn());
  expect(Audit.findOneAndUpdate.mock.lastCall[0]).toMatchObject({ mode: 'force_status', status: 'applied', details_processing: { $ne: true } });
  expect(fetchImportedShiprocketDetails).toHaveBeenCalledWith({ candidate, rows: [], adminId: 'admin1' });
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ done: true, cursor: 1, total: 1 }) }));
});
it('records provider failures and releases the claim', async () => {
  Audit.findOneAndUpdate.mockResolvedValue({ _id: 'audit1', candidates: [{ reference: '1' }], outcomes: [{ reference: '1', status: 'synced' }], rows: [] });
  fetchImportedShiprocketDetails.mockRejectedValue(Error('Shiprocket unavailable'));
  await fetchDetails(req, res(), vi.fn());
  expect(Audit.updateOne).toHaveBeenCalledWith({ _id: 'audit1' }, { $set: { details_processing: false, details_cursor: 1 }, $push: { details_outcomes: { reference: '1', status: 'blocked', reason: 'Shiprocket unavailable' } } });
});
it('rejects incomplete imports and concurrent claims', async () => {
  Audit.findOneAndUpdate.mockResolvedValue(null);
  const next = vi.fn();
  await fetchDetails(req, res(), next);
  expect(next).toHaveBeenCalled();
  expect(fetchImportedShiprocketDetails).not.toHaveBeenCalled();
});
