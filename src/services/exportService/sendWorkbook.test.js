import { describe, it, vi, expect } from 'vitest';
vi.mock('../index.js', () => ({ auditService: { recordAudit: vi.fn() } }));
import { auditService } from '../index.js';
import { sendWorkbook } from './sendWorkbook.js';
describe('shared Excel download response', () => {
  it('audits and sends the workbook with Excel download headers', async () => {
    const res = { setHeader: vi.fn(), end: vi.fn() };
    const workbook = { xlsx: { write: vi.fn() } };
    await sendWorkbook({ req: { auth: { user_id: 'admin' } }, res, workbook, entity: 'categories', event: 'CATEGORY_EXPORTED', metadata: { count: 1 } });
    expect(auditService.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ event: 'CATEGORY_EXPORTED', metadata: { count: 1 } }));
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringMatching(/categories-export-.*\.xlsx/));
    expect(workbook.xlsx.write).toHaveBeenCalledWith(res);
    expect(res.end).toHaveBeenCalled();
  });
});
