import { sendWorkbook } from "../../../../services/exportService/sendWorkbook.js";
import { buildProductsExportWorkbook } from '../../../../services/inventory/product/exportProducts.js';


export const exportProducts = async (req, res, next) => {
  try {
    const { workbook, count, productCount } = await buildProductsExportWorkbook(req.query);
    await sendWorkbook({ req, res, workbook, entity: 'products', event: 'PRODUCT_EXPORTED', metadata: { count, productCount, selection: req.query.product_ids ? 'selected' : 'filtered' } });
  } catch (error) { next(error); }
};
