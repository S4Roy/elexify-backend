import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import Category from '../../../models/Category.js';
import { StatusError } from '../../../config/index.js';
import { buildCategoryListPipeline } from './buildCategoryListPipeline.js';

export const buildCategoriesExportWorkbook = async (query = {}) => {
  const { pipeline } = await buildCategoryListPipeline(query);
  if (query.category_ids) pipeline.unshift({ $match: { _id: { $in: query.category_ids.split(',').map(id => new mongoose.Types.ObjectId(id)) } } });
  pipeline.push({ $sort: { [query.sort_by || 'sort_order']: Number(query.sort_order) || 1, _id: 1 } }, { $limit: 20001 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Categories');
  sheet.columns = [['Category ID', 'id'], ['Name', 'name'], ['Slug', 'slug'], ['Parent category', 'parent'], ['Status', 'status'], ['Products', 'products'], ['Sort order', 'sort_order']].map(([header, key]) => ({ header, key, width: 28 }));
  let count = 0;
  for await (const category of Category.aggregate(pipeline).cursor({ batchSize: 100 })) {
    if (++count > 20000) throw StatusError.badRequest('Export exceeds 20,000 rows. Narrow the filters and try again.');
    sheet.addRow({ id: String(category._id), name: category.name, slug: category.slug,
      parent: category.parent_category?.name || '', status: category.status, products: category.products || 0, sort_order: category.sort_order });
  }
  if (!count) throw StatusError.badRequest('No categories match the current filters to export.');
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = 'A1:G1';
  return { workbook, count };
};
