import ExcelJS from 'exceljs';

export const parseOrderWorkbook = async buffer => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets.filter(sheet => sheet.actualRowCount > 0);
  if (sheets.length !== 1) throw Error('Upload a workbook containing one populated worksheet.');
  const sheet = sheets[0];
  if (sheet.rowCount > 20001 || sheet.columnCount > 100) throw Error('Workbook exceeds the 20,000 row or 100 column limit.');
  const headers = [];
  sheet.getRow(1).eachCell((cell, column) => { headers[column] = cell.text.trim().replace(/^\uFEFF/, ''); });
  if (!headers.includes('Order ID') || !headers.includes('Status')) throw Error('Workbook must contain Order ID and Status columns.');
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw Error('Workbook has duplicate column headers.');
  const rows = [];
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const result = {};
    headers.forEach((header, column) => {
      if (!header) return;
      const cell = row.getCell(column);
      if (cell.type === ExcelJS.ValueType.Formula) throw Error(`Formulas are not accepted (row ${number}). Upload values only.`);
      const value = cell.value;
      result[header] = value instanceof Date
        ? `${value.getUTCMonth() + 1}/${value.getUTCDate()}/${value.getUTCFullYear()}`
        : cell.text.trim();
    });
    if (Object.values(result).some(Boolean)) rows.push(result);
  });
  return rows;
};
