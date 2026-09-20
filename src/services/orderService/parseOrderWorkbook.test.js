import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { parseOrderWorkbook } from './parseOrderWorkbook.js';
it('parses numeric IDs, text IDs and dates from an Excel workbook', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Orders');
  sheet.addRow(['Order ID', 'Shiprocket Created At', 'Status']);
  sheet.addRow([4271, new Date('2024-12-31T16:33:00Z'), 'DELIVERED']);
  sheet.addRow(['0012-C', '', 'LOST']);
  const rows = await parseOrderWorkbook(await book.xlsx.writeBuffer());
  expect(rows).toEqual([{ 'Order ID': '4271', 'Shiprocket Created At': '12/31/2024', Status: 'DELIVERED' }, { 'Order ID': '0012-C', 'Shiprocket Created At': '', Status: 'LOST' }]);
});
it('rejects formula cells and ambiguous multiple sheets', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Orders');
  sheet.addRow(['Order ID', 'Status']);
  sheet.addRow([{ formula: '1+1', result: 2 }, 'DELIVERED']);
  await expect(parseOrderWorkbook(await book.xlsx.writeBuffer())).rejects.toThrow(/Formulas/);
  book.addWorksheet('Other').addRow(['Order ID', 'Status']);
  await expect(parseOrderWorkbook(await book.xlsx.writeBuffer())).rejects.toThrow(/one populated/);
});
it('rejects missing required headers', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Orders').addRow(['Other']);
  await expect(parseOrderWorkbook(await book.xlsx.writeBuffer())).rejects.toThrow(/Order ID and Status/);
});
