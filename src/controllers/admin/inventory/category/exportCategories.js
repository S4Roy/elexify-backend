import { buildCategoriesExportWorkbook } from '../../../../services/inventory/category/exportCategories.js';
import { sendWorkbook } from '../../../../services/exportService/sendWorkbook.js';

export const exportCategories = async (req, res, next) => {
  try {
    const { workbook, count } = await buildCategoriesExportWorkbook(req.query);
    await sendWorkbook({ req, res, workbook, entity: 'categories', event: 'CATEGORY_EXPORTED',
      metadata: { count, selection: req.query.category_ids ? 'selected' : 'filtered' } });
  } catch (error) { next(error); }
};
