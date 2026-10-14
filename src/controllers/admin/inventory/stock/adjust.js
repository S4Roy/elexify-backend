import { auditService, stockService } from "../../../../services/index.js";

// Shape returned for one SKU after a stock change.
export const stockLevel = (doc) => ({
  product: doc.product_id || doc._id,
  variation: doc.product_id ? doc._id : null,
  sku: doc.sku || null,
  stock_quantity: doc.stock_quantity ?? 0,
  reserved_quantity: doc.reserved_quantity ?? 0,
  // null = unlimited (stock not managed).
  available_quantity: doc.manage_stock === false ? null : stockService.availableOf(doc),
  stock_status: doc.stock_status,
  manage_stock: doc.manage_stock !== false,
  allow_backorders: Boolean(doc.allow_backorders),
  low_stock_threshold: doc.low_stock_threshold ?? null,
});

export const applyAdjustment = async (row, req) => {
  const actor = { type: "admin", id: req.auth?.user_id || null };
  const params = {
    product: row.product,
    variation: row.variation || null,
    reason: row.reason,
    note: row.note || null,
    expectedOnHand: row.expected_on_hand ?? null,
    actor,
  };
  const { doc, delta } = await stockService.withStockTransaction((session) => (row.mode === "set"
    ? stockService.setStockCount({ ...params, count: row.quantity, session })
    : stockService.adjustStock({ ...params, delta: row.quantity, session })));

  if (delta) {
    await auditService.recordAudit({
      userId: null,
      event: "STOCK_ADJUSTED",
      req,
      actorId: actor.id,
      reason: row.reason,
      metadata: {
        product: row.product,
        variation: row.variation || null,
        mode: row.mode,
        delta,
        balance_after: doc.stock_quantity,
        note: row.note || null,
      },
    });
  }
  return stockLevel(doc);
};

/**
 * POST /admin/inventory/stock/adjust
 * Manual stock adjustment with a reason code (delta or counted "set").
 */
export const adjust = async (req, res, next) => {
  try {
    const data = await applyAdjustment(req.body, req);
    res.status(200).json({ status: "success", message: req.__("Stock adjusted successfully"), data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /admin/inventory/stock/adjust/bulk
 * Applies up to 200 adjustments, each in its own transaction, and reports
 * per-row results so one bad row doesn't block the rest.
 */
export const bulkAdjust = async (req, res, next) => {
  try {
    const results = [];
    for (const [index, row] of req.body.rows.entries()) {
      try {
        results.push({ index, ok: true, data: await applyAdjustment(row, req) });
      } catch (error) {
        results.push({ index, ok: false, status: error.statusCode || 500, message: error.message, details: error.details || null });
      }
    }
    const failed = results.filter((r) => !r.ok).length;
    res.status(200).json({
      status: "success",
      message: req.__(failed ? `${results.length - failed} adjusted, ${failed} failed` : "Stock adjusted successfully"),
      data: { results, succeeded: results.length - failed, failed },
    });
  } catch (error) {
    next(error);
  }
};
