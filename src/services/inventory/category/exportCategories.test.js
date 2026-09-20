import { afterEach, describe, it, expect, vi } from 'vitest';
import Category from '../../../models/Category.js';
import { buildCategoriesExportWorkbook } from './exportCategories.js';
const id = '507f1f77bcf86cd799439011';
const mockRows = rows => vi.spyOn(Category, 'aggregate').mockReturnValue({ cursor: () => (async function* () { yield* rows; })() });
afterEach(() => vi.restoreAllMocks());
describe('category exports', () => {
  it('combines selection, status, search and parent filtering without pagination', async () => {
    const aggregate = mockRows([{ _id: id, name: '=test', parent_category: { name: 'Parts' }, products: 3 }]);
    const { workbook, count } = await buildCategoriesExportWorkbook({ category_ids: id, parent_category: id, status: 'active', search_key: 'motor', page: 4 });
    const pipeline = aggregate.mock.calls[0][0];
    expect(String(pipeline[0].$match._id.$in[0])).toBe(id);
    expect(pipeline[1].$match.status).toEqual({ $in: ['active'] });
    expect(String(pipeline[1].$match.parent_category)).toBe(id);
    expect(JSON.stringify(pipeline)).toContain('motor');
    expect(pipeline.some(stage => stage.$skip)).toBe(false);
    expect(count).toBe(1);
    expect(workbook.getWorksheet('Categories').getCell('B2').value).toBe('=test');
    expect(workbook.getWorksheet('Categories').getCell('D2').value).toBe('Parts');
    expect(workbook.getWorksheet('Categories').getCell('F2').value).toBe(3);
  });
  it('does not export unrelated categories for a missing parent slug', async () => {
    const aggregate = mockRows([]);
    vi.spyOn(Category, 'findOne').mockReturnValue({ exec: async () => null });
    await expect(buildCategoriesExportWorkbook({ slug: 'missing' })).rejects.toThrow('No categories');
    expect(aggregate.mock.calls[0][0][0].$match._id).toEqual({ $in: [] });
  });
  it('rejects empty exports', async () => {
    mockRows([]);
    await expect(buildCategoriesExportWorkbook()).rejects.toThrow('No categories');
  });
  it('rejects more than 20,000 rows rather than truncating', async () => {
    mockRows(Array.from({ length: 20001 }, () => ({ _id: id, name: 'Part' })));
    await expect(buildCategoriesExportWorkbook()).rejects.toThrow('20,000');
  });
});
