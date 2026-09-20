import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import Product from '../../../models/Product.js';
import SiteSetting from '../../../models/SiteSetting.js';
import { buildProductsExportWorkbook, PRODUCT_EXPORT_ROW_LIMIT } from './exportProducts.js';

const id = '507f1f77bcf86cd799439011';
const product = { _id: id, name: '=SUM(A1:A2)', type: 'simple', sku: '00123', regular_price: 120, stock_quantity: 0 };
const mockProducts = products => {
  vi.spyOn(SiteSetting, 'findOne').mockResolvedValue(null);
  return vi.spyOn(Product, 'aggregate').mockReturnValue({ cursor: () => (async function* () { yield* products; })() });
};
afterEach(() => vi.restoreAllMocks());

describe('product export', () => {
  it('exports numeric prices and stock, keeps SKU and formula-like names as text', async () => {
    mockProducts([product]);
    const { workbook, count } = await buildProductsExportWorkbook();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
    const sheet = loaded.getWorksheet('Products');
    expect(count).toBe(1);
    expect(sheet.getCell('B2').value).toBe('=SUM(A1:A2)');
    expect(sheet.getCell('D2').value).toBe('00123');
    expect(sheet.getCell('L2').value).toBe(120);
    expect(sheet.getCell('N2').value).toBe(0);
  });
  it('includes one row per variation with its parent identity', async () => {
    mockProducts([{ ...product, type: 'variable', variations: [
      { _id: 'v1', sku: 'RED', regular_price: 10 }, { _id: 'v2', sku: 'BLUE', regular_price: 20 },
    ] }]);
    const { workbook, count, productCount } = await buildProductsExportWorkbook();
    expect([count, productCount]).toEqual([2, 1]);
    expect(workbook.getWorksheet('Products').getCell('D3').value).toBe('BLUE');
    expect(workbook.getWorksheet('Products').getCell('A3').value).toBe(id);
  });
  it('combines selected IDs, filters and sorting without pagination', async () => {
    const aggregate = mockProducts([product]);
    await buildProductsExportWorkbook({ product_ids: id, status: 'active', search_key: 'motor', stock_status: 'low_stock', page: 3, sort_by: 'name', sort_order: 1 });
    const pipeline = aggregate.mock.calls[0][0];
    expect(String(pipeline[0].$match._id.$in[0])).toBe(id);
    expect(pipeline[1].$match).toMatchObject({ deleted_at: null, status: 'active' });
    expect(JSON.stringify(pipeline)).toContain('motor');
    expect(JSON.stringify(pipeline)).toContain('stock_quantity');
    expect(pipeline.at(-2)).toEqual({ $sort: { name: 1, _id: 1 } });
    expect(pipeline.some(stage => stage.$skip)).toBe(false);
  });
  it('rejects empty exports', async () => {
    mockProducts([]);
    await expect(buildProductsExportWorkbook()).rejects.toThrow('No products');
  });
  it('rejects oversized exports including variation rows', async () => {
    mockProducts([{ ...product, type: 'variable', variations: Array.from({ length: PRODUCT_EXPORT_ROW_LIMIT + 1 }, () => ({ _id: 'v', sku: 'SKU' })) }]);
    await expect(buildProductsExportWorkbook()).rejects.toThrow('Narrow the filters');
  });
});
