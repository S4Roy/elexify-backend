// Checks the stock invariants maintained by services/stock:
//   on-hand:  sum(StockTransaction.delta) == stock_quantity
//   reserved: sum(active StockReservation.quantity) == reserved_quantity
// Dry run reports drift. A real run repairs it: reserved_quantity is reset
// to the sum of active holds (the reservations are the source of truth), and
// on-hand drift is booked as a count_correction ledger row — stock_quantity
// itself is never changed, since it's what has actually been selling.
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import StockReservation from "../../../../models/StockReservation.js";
import StockTransaction from "../../../../models/StockTransaction.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";
import { RESERVATION_STATUS } from "../../../../constants/stock.js";
import { stockStatusPipelineSet } from "../../../../services/stock/availability.js";

const REPORT_LIMIT = 50;

const sumBySku = async (Model, match, field) => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: { $ifNull: ["$variation", "$product"] }, sum: { $sum: `$${field}` } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.sum]));
};

export const findStockDrift = async () => {
  const [ledger, holds, products, variations] = await Promise.all([
    sumBySku(StockTransaction, { delta: { $exists: true }, deleted_at: null }, "delta"),
    sumBySku(StockReservation, { status: RESERVATION_STATUS.ACTIVE }, "quantity"),
    Product.find({ deleted_at: null, type: { $ne: "variable" } }).select("_id sku stock_quantity reserved_quantity manage_stock").lean(),
    ProductVariation.find({ deleted_at: null }).select("_id product_id sku stock_quantity reserved_quantity manage_stock").lean(),
  ]);
  const drift = [];
  const check = (doc, product, variation) => {
    const id = String(doc._id);
    const onHand = Number(doc.stock_quantity || 0);
    const reserved = Number(doc.reserved_quantity || 0);
    const ledgerSum = ledger.get(id) || 0;
    const held = holds.get(id) || 0;
    const onHandDrift = doc.manage_stock === false ? 0 : onHand - ledgerSum;
    if (onHandDrift !== 0 || reserved !== held) {
      drift.push({ product, variation, sku: doc.sku || null, on_hand: onHand, ledger_sum: ledgerSum, on_hand_drift: onHandDrift, reserved, held });
    }
  };
  products.forEach((p) => check(p, p._id, null));
  variations.forEach((v) => check(v, v.product_id, v._id));
  return drift;
};

const describe = (d) => `${d.sku || d.variation || d.product}: on-hand ${d.on_hand} vs ledger ${d.ledger_sum}, reserved ${d.reserved} vs held ${d.held}`;

const handler = async (context) => {
  const drift = await findStockDrift();
  const warnings = drift.slice(0, REPORT_LIMIT).map(describe);
  if (drift.length > REPORT_LIMIT) warnings.push(`…and ${drift.length - REPORT_LIMIT} more`);

  if (context.dryRun) {
    context.logger.info(`Dry run: ${drift.length} SKU(s) drifted.`);
    return { wouldInsert: drift.filter((d) => d.on_hand_drift).length, wouldUpdate: drift.filter((d) => d.reserved !== d.held).length, wouldSkip: 0, wouldDelete: 0, warnings };
  }

  let inserted = 0;
  let updated = 0;
  for (const d of drift) {
    const Model = d.variation ? ProductVariation : Product;
    const id = d.variation || d.product;
    if (d.reserved !== d.held) {
      await Model.updateOne({ _id: id }, [{ $set: { reserved_quantity: d.held } }, stockStatusPipelineSet()]);
      updated += 1;
    }
    if (d.on_hand_drift) {
      await StockTransaction.create({
        product: d.product, variation: d.variation, type: "adjustment",
        quantity: Math.abs(d.on_hand_drift), delta: d.on_hand_drift, balance_after: d.on_hand,
        reason: "count_correction", note: "Ledger reconciliation (stock-reconcile)",
        reference_type: "adjustment", actor_type: "system",
      });
      inserted += 1;
    }
  }
  context.logger.info(`Reconciled ${drift.length} SKU(s): ${updated} reserved count(s) reset, ${inserted} ledger correction(s) booked.`);
  return { inserted, updated, skipped: 0, deleted: 0, warnings };
};

export default {
  key: "stock-reconcile",
  name: "Reconcile Stock Ledger",
  description: "Reports SKUs whose on-hand stock disagrees with the stock ledger or whose reserved count disagrees with active reservations; a real run repairs both without changing on-hand stock.",
  type: "REPAIR",
  category: "commerce",
  version: 1,
  required: false,
  idempotent: true,
  risk: "MEDIUM",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: ["stock-ledger-foundation"],
  estimatedImpact: "Read-only on dry run. A real run resets reserved_quantity on drifted SKUs and inserts one count_correction stock_transactions row per SKU with on-hand drift.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.REPAIR_EXECUTE,
  handler,
};
