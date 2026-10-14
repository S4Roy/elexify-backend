// One-time foundation for on-hand / reserved / available stock management
// (services/stock). Idempotent — safe to re-run:
//   1. backfills reserved_quantity / manage_stock / allow_backorders and the
//      derived stock_status on every product and variation;
//   2. creates the new ledger / reservation / order indexes, then drops the
//      old {reference_id, product, variation, type} unique indexes they
//      replace (new first, so there's no window without replay protection);
//   3. books one opening_balance ledger row per SKU so that from here on
//      sum(StockTransaction.delta) == stock_quantity (rows written by the new
//      code before this ran are netted out);
//   4. backfills Order.stock_state from the legacy stock_reserved /
//      inventory_reverted flags.
import Order from "../../../../models/Order.js";
import Product from "../../../../models/Product.js";
import ProductVariation from "../../../../models/ProductVariation.js";
import StockReservation from "../../../../models/StockReservation.js";
import StockTransaction from "../../../../models/StockTransaction.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";
import { STOCK_STATUS } from "../../../../constants/stock.js";
import { stockStatusPipelineSet } from "../../../../services/stock/availability.js";

const LEGACY_INDEX_KEY = JSON.stringify({ reference_id: 1, product: 1, variation: 1, type: 1 });

const defaults = [
  ["reserved_quantity", 0],
  ["manage_stock", true],
  ["allow_backorders", false],
];

const backfillFields = async (Model, dryRun) => {
  let touched = 0;
  for (const [field, value] of defaults) {
    const filter = { [field]: { $exists: false } };
    touched += dryRun ? await Model.countDocuments(filter) : (await Model.updateMany(filter, { $set: { [field]: value } })).modifiedCount;
  }
  return touched;
};

const legacyIndexes = async () => (await StockTransaction.collection.indexes())
  .filter((index) => index.unique && JSON.stringify(index.key) === LEGACY_INDEX_KEY);

// Ledger sum of rows that carry a delta, per SKU id (variation id or product id).
const ledgerSums = async () => {
  const rows = await StockTransaction.aggregate([
    { $match: { delta: { $exists: true }, deleted_at: null } },
    { $group: { _id: { $ifNull: ["$variation", "$product"] }, sum: { $sum: "$delta" }, opening: { $max: { $eq: ["$type", "opening_balance"] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
};

const skus = async () => {
  const [products, variations] = await Promise.all([
    Product.find({ deleted_at: null, type: { $ne: "variable" } }).select("_id stock_quantity manage_stock").lean(),
    ProductVariation.find({ deleted_at: null }).select("_id product_id stock_quantity manage_stock").lean(),
  ]);
  return [
    ...products.map((p) => ({ product: p._id, variation: null, id: String(p._id), stock: Number(p.stock_quantity || 0), managed: p.manage_stock !== false })),
    ...variations.map((v) => ({ product: v.product_id, variation: v._id, id: String(v._id), stock: Number(v.stock_quantity || 0), managed: v.manage_stock !== false })),
  ];
};

const rollUpVariableStatus = async () => {
  const rows = await ProductVariation.aggregate([
    { $match: { deleted_at: null, status: { $ne: "inactive" } } },
    { $group: { _id: "$product_id", statuses: { $addToSet: "$stock_status" } } },
  ]);
  const ops = rows.map(({ _id, statuses }) => {
    let status = STOCK_STATUS.OUT_OF_STOCK;
    if (statuses.includes(STOCK_STATUS.IN_STOCK)) status = STOCK_STATUS.IN_STOCK;
    else if (statuses.includes(STOCK_STATUS.ON_BACKORDER)) status = STOCK_STATUS.ON_BACKORDER;
    return { updateOne: { filter: { _id, type: "variable" }, update: { $set: { stock_status: status } } } };
  });
  if (ops.length) await Product.bulkWrite(ops);
  // Variable products with no live variations.
  await Product.updateMany(
    { type: "variable", _id: { $nin: rows.map((r) => r._id) } },
    { $set: { stock_status: STOCK_STATUS.OUT_OF_STOCK } },
  );
};

const orderStateBackfills = [
  [{ stock_reserved: true, inventory_reverted: { $ne: true } }, "committed"],
  [{ stock_reserved: true, inventory_reverted: true }, "restocked"],
  [{ stock_reserved: { $ne: true } }, "none"],
];

const handler = async (context) => {
  const { dryRun, logger } = context;
  const warnings = [];

  // 1. Field defaults + derived status.
  const fieldUpdates = (await backfillFields(Product, dryRun)) + (await backfillFields(ProductVariation, dryRun));

  // 3 (computed before any write so dry-run reports the same plan).
  const sums = await ledgerSums();
  const openingRows = [];
  for (const sku of await skus()) {
    const existing = sums.get(sku.id);
    if (!sku.managed || existing?.opening) continue;
    const delta = sku.stock - (existing?.sum || 0);
    if (delta === 0) continue;
    if (sku.stock < 0) warnings.push(`SKU ${sku.id} has negative on-hand (${sku.stock}); opening balance booked as-is.`);
    openingRows.push({
      product: sku.product,
      variation: sku.variation,
      type: "opening_balance",
      quantity: Math.abs(delta),
      delta,
      balance_after: sku.stock,
      reason: "opening_balance",
      note: "Opening balance (stock ledger foundation)",
      reference_type: "opening_balance",
      idempotency_key: `opening:${sku.id}`,
      actor_type: "system",
    });
  }

  const legacy = await legacyIndexes();
  const orderCounts = await Promise.all(orderStateBackfills.map(([filter]) => Order.countDocuments({ ...filter, stock_state: { $exists: false } })));

  if (dryRun) {
    logger.info(`Dry run: ${fieldUpdates} stock field default(s) to backfill, ${openingRows.length} opening balance row(s) to book, ${legacy.length} legacy ledger index(es) to drop, ${orderCounts.reduce((a, b) => a + b, 0)} order stock_state value(s) to backfill.`);
    return { wouldInsert: openingRows.length, wouldUpdate: fieldUpdates + orderCounts.reduce((a, b) => a + b, 0), wouldSkip: 0, wouldDelete: legacy.length };
  }

  await Product.updateMany({ type: { $ne: "variable" } }, [stockStatusPipelineSet()]);
  await ProductVariation.updateMany({}, [stockStatusPipelineSet()]);
  await rollUpVariableStatus();

  // 2. New indexes first, then drop the legacy ones they replace. Only the
  // indexes this feature adds are built — never a model-wide createIndexes,
  // which would also try to (re)build unrelated product indexes.
  await Promise.all([
    StockTransaction.collection.createIndex({ idempotency_key: 1 }, { unique: true, sparse: true }),
    StockTransaction.collection.createIndex({ product: 1, variation: 1, created_at: -1 }),
    StockTransaction.collection.createIndex({ reference_id: 1 }),
    StockReservation.createIndexes(),
    Product.collection.createIndex({ stock_status: 1 }),
  ]);
  for (const index of legacy) {
    await StockTransaction.collection.dropIndex(index.name);
    logger.info(`Dropped legacy stock ledger index ${index.name}.`);
  }

  // 3. Opening balances.
  let inserted = 0;
  if (openingRows.length) {
    try {
      inserted = (await StockTransaction.insertMany(openingRows, { ordered: false })).length;
    } catch (error) {
      // A concurrent writer already booked some openings (duplicate key) — fine.
      if (error?.code !== 11000 && !error?.writeErrors) throw error;
      inserted = error.insertedDocs?.length ?? 0;
    }
  }

  // 4. Order stock_state.
  let ordersUpdated = 0;
  for (const [filter, state] of orderStateBackfills) {
    ordersUpdated += (await Order.updateMany({ ...filter, stock_state: { $exists: false } }, { $set: { stock_state: state } })).modifiedCount;
  }

  logger.info(`Backfilled ${fieldUpdates} stock field(s), booked ${inserted} opening balance(s), dropped ${legacy.length} legacy index(es), set stock_state on ${ordersUpdated} order(s).`);
  return { inserted, updated: fieldUpdates + ordersUpdated, skipped: 0, deleted: legacy.length, warnings };
};

export default {
  key: "stock-ledger-foundation",
  name: "Stock Ledger Foundation",
  description: "Backfills reserved/available stock fields and statuses, books an opening-balance ledger row per SKU, replaces the legacy ledger unique indexes and backfills Order.stock_state.",
  type: "MIGRATION",
  category: "commerce",
  version: 1,
  required: true,
  idempotent: true,
  risk: "HIGH",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Updates every product and variation (stock fields + stock_status), inserts one stock_transactions row per SKU with non-zero stock, drops two indexes on stock_transactions, and sets stock_state on every order lacking it. Never changes stock_quantity.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.MIGRATION_EXECUTE,
  handler,
};
