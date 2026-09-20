import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import Product from '../../../models/Product.js';
import { StatusError } from '../../../config/index.js';
import { buildProductListPipeline } from './buildProductListPipeline.js';

export const PRODUCT_EXPORT_ROW_LIMIT = 20000;

export const productExportRows = product => {
  const common = {
    product_id: String(product._id), name: product.name, type: product.type,
    status: product.status, brand: product.brand?.name || '',
    categories: (product.categories || []).map(c => c.name).join(', '),
    sub_categories: (product.sub_categories || []).map(c => c.name).join(', '),
    tags: (product.tags || []).map(t => t.name).join(', '),
    slug: product.slug, created_at: product.created_at,
  };
  const row = item => ({ ...common, sku: item.sku || '', regular_price: item.regular_price,
    sale_price: item.sale_price, stock_quantity: item.stock_quantity, weight: item.weight,
    variation_id: item === product ? '' : String(item._id),
    attributes: (item.attributes || []).filter(a => a.value).map(a => `${a.attribute?.name || ''}: ${a.value?.name || a.value?.value || ''}`).join(', '),
  });
  return product.type === 'variable' && product.variations?.length
    ? product.variations.map(row) : [row(product)];
};

export const buildProductsExportWorkbook = async (query = {}) => {
  const { pipeline } = await buildProductListPipeline(query);
  const ids = query.product_ids?.split(',') || [];
  if (ids.length) pipeline.unshift({ $match: { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } } });
  pipeline.push({ $sort: { [query.sort_by || 'created_at']: Number(query.sort_order) || -1, _id: 1 } }, { $limit: PRODUCT_EXPORT_ROW_LIMIT + 1 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Products');
  sheet.columns = [
    ['Product ID', 'product_id'], ['Name', 'name'], ['Type', 'type'], ['SKU', 'sku'],
    ['Variation ID', 'variation_id'], ['Attributes', 'attributes'], ['Status', 'status'],
    ['Brand', 'brand'], ['Categories', 'categories'], ['Subcategories', 'sub_categories'],
    ['Tags', 'tags'], ['Regular price', 'regular_price'], ['Sale price', 'sale_price'],
    ['Stock quantity', 'stock_quantity'], ['Weight (kg)', 'weight'], ['Slug', 'slug'], ['Created at', 'created_at'],
  ].map(([header, key]) => ({ header, key, width: key === 'name' ? 45 : 24 }));
  let count = 0;
  let productCount = 0;
  for await (const product of Product.aggregate(pipeline).cursor({ batchSize: 100 })) {
    productCount++;
    for (const row of productExportRows(product)) {
      if (++count > PRODUCT_EXPORT_ROW_LIMIT) throw StatusError.badRequest(`Export exceeds ${PRODUCT_EXPORT_ROW_LIMIT} rows including variations. Narrow the filters and try again.`);
      sheet.addRow(row);
    }
  }
  if (!count) throw StatusError.badRequest('No products match the current filters to export.');
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  for (const key of ['regular_price', 'sale_price', 'weight']) sheet.getColumn(key).numFmt = '0.00';
  sheet.getColumn('created_at').numFmt = 'yyyy-mm-dd hh:mm';
  return { workbook, count, productCount };
};
