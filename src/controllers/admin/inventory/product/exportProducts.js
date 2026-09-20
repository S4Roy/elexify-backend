import { buildProductsExportWorkbook } from '../../../../services/inventory/product/exportProducts.js';
import { auditService } from '../../../../services/index.js';

export const exportProducts = async (req, res, next) => {
  try {
    const { workbook, count, productCount } = await buildProductsExportWorkbook(req.query);
    await auditService.recordAudit({ userId: req.auth.user_id, actorId: req.auth.user_id, req,
      event: 'PRODUCT_EXPORTED', metadata: { count, productCount, selection: req.query.product_ids ? 'selected' : 'filtered' } });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) { next(error); }
};
