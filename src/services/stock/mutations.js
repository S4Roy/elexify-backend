// The single choke point for moving stock. Every on-hand change is a guarded
// atomic update plus a ledger row (StockTransaction) with a signed delta and
// balance_after; every hold is a StockReservation plus a reserved_quantity
// move. All functions require a Mongo session so callers compose them into
// their own transaction with the order/payment state change.
import mongoose from "mongoose";
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import SiteSetting from "../../models/SiteSetting.js";
import StockReservation from "../../models/StockReservation.js";
import StockTransaction from "../../models/StockTransaction.js";
import { StatusError } from "../../config/index.js";
import {
  DEFAULT_RESERVATION_TTL_MINUTES,
  ORDER_STOCK_STATE,
  RESERVATION_STATUS,
  RESERVATION_TTL_SETTING_SLUG,
  STOCK_REASON,
  STOCK_STATUS,
} from "../../constants/stock.js";
import { availableExpr, stockStatusPipelineSet } from "./availability.js";

const requireSession = (session) => {
  if (!session) throw new Error("services/stock: a Mongo session is required");
};

const modelFor = (variation) => (variation ? ProductVariation : Product);
const skuIdOf = ({ product, variation }) => String(variation || product);

// Runs `work(session)` in the caller's session, or in a fresh transaction.
export const withStockTransaction = async (work, session = null) => {
  if (session) return work(session);
  const own = await mongoose.startSession();
  try {
    let result;
    await own.withTransaction(async () => { result = await work(own); });
    return result;
  } finally {
    await own.endSession();
  }
};

// OrderItem docs → stock lines, merged per SKU (an order may carry the same
// variation on two lines; reservations are unique per SKU).
export const linesFromItems = (items) => {
  const bySku = new Map();
  for (const item of items) {
    const line = {
      product: item.product_id ?? item.product,
      variation: item.variation_id ?? item.variation ?? null,
      quantity: Number(item.quantity),
      mrp: item.regular_price || item.mrp || 0,
      selling_price: item.unit_price || item.selling_price || 0,
    };
    const key = skuIdOf(line);
    const existing = bySku.get(key);
    if (existing) existing.quantity += line.quantity;
    else bySku.set(key, line);
  }
  return [...bySku.values()].filter((line) => line.quantity > 0);
};

// Guards a decrement of `qty` from available stock. Unmanaged and backorder
// SKUs always pass.
const sellableGuard = (qty) => ({
  status: { $ne: "inactive" },
  $or: [
    { manage_stock: false },
    { allow_backorders: true },
    { $expr: { $gte: [availableExpr(), qty] } },
  ],
});

// One atomic, guarded move on a SKU that also re-derives stock_status.
// Returns the post-image, or null if the guard rejected it.
const moveStock = async ({ product, variation, stockDelta = 0, reservedDelta = 0, guard = {}, session }) => {
  const Model = modelFor(variation);
  const doc = await Model.findOneAndUpdate(
    { _id: variation || product, ...guard },
    [
      {
        $set: {
          stock_quantity: { $add: [{ $ifNull: ["$stock_quantity", 0] }, stockDelta] },
          reserved_quantity: { $max: [0, { $add: [{ $ifNull: ["$reserved_quantity", 0] }, reservedDelta] }] },
          updated_at: "$$NOW",
        },
      },
      stockStatusPipelineSet(),
    ],
    { new: true, session },
  );
  if (doc && variation) await refreshParentStatus(product, session);
  return doc;
};

// A variable product's own stock_status rolls up from its live variations.
export const refreshParentStatus = async (productId, session = null) => {
  const statuses = await ProductVariation.distinct("stock_status", {
    product_id: productId,
    deleted_at: null,
    status: { $ne: "inactive" },
  }).session(session);
  let status = STOCK_STATUS.OUT_OF_STOCK;
  if (statuses.includes(STOCK_STATUS.IN_STOCK)) status = STOCK_STATUS.IN_STOCK;
  else if (statuses.includes(STOCK_STATUS.ON_BACKORDER)) status = STOCK_STATUS.ON_BACKORDER;
  await Product.updateOne({ _id: productId, type: "variable" }, { $set: { stock_status: status } }, { session });
};

/**
 * Re-derives stock_status after a settings change (manage_stock,
 * allow_backorders) made outside this module, e.g. a product edit.
 */
export const refreshStockStatus = async ({ product, variation = null, session = null }) => {
  await modelFor(variation).updateOne({ _id: variation || product }, [stockStatusPipelineSet()], { session });
  if (variation) await refreshParentStatus(product, session);
};

/** Books the starting quantity of a newly created SKU as an opening balance. */
export const recordOpeningStock = async ({ product, variation = null, quantity, actor, referenceType = "opening_balance" }) => {
  const qty = Math.trunc(Number(quantity) || 0);
  if (qty <= 0) return null;
  return withStockTransaction((session) => adjustStock({
    product, variation, delta: qty, reason: STOCK_REASON.OPENING_BALANCE, referenceType,
    idempotencyKey: `opening:${variation || product}`, actor, session,
  }));
};

const writeLedger = async ({ doc, line, delta, type, reason, note = null, referenceId = null, referenceType, idempotencyKey, actor, session }) => {
  await StockTransaction.create([{
    product: line.product,
    variation: line.variation || null,
    type,
    quantity: Math.abs(delta),
    delta,
    balance_after: doc.stock_quantity,
    reason,
    note,
    reference_id: referenceId,
    reference_type: referenceType,
    idempotency_key: idempotencyKey,
    actor_type: actor?.type || "system",
    created_by: actor?.id || null,
    mrp: line.mrp || 0,
    selling_price: line.selling_price || 0,
    cost_price: line.cost_price || 0,
  }], { session });
};

const alreadyApplied = async (idempotencyKey, session) =>
  Boolean(idempotencyKey && await StockTransaction.exists({ idempotency_key: idempotencyKey }).session(session));

const outOfStock = (line) => {
  const err = StatusError.conflict("OUT_OF_STOCK");
  err.details = { product: String(line.product), variation: line.variation ? String(line.variation) : null };
  return err;
};

/**
 * Decrements on-hand for each line, guarded on available stock.
 * Used for COD placement, reopen, replacement and late captures.
 * Throws StatusError.conflict("OUT_OF_STOCK") on the first short line.
 */
export const commitLines = async ({ lines, referenceId, referenceType = "order", keyPrefix, reason = STOCK_REASON.ORDER_SALE, actor, session }) => {
  requireSession(session);
  for (const line of lines) {
    const idempotencyKey = keyPrefix ? `${keyPrefix}:${skuIdOf(line)}` : undefined;
    if (await alreadyApplied(idempotencyKey, session)) continue;
    const doc = await moveStock({ ...line, stockDelta: -line.quantity, guard: sellableGuard(line.quantity), session });
    if (!doc) throw outOfStock(line);
    if (doc.manage_stock === false) continue;
    await writeLedger({ doc, line, delta: -line.quantity, type: "sale", reason, referenceId, referenceType, idempotencyKey, actor, session });
  }
};

/** Increments on-hand for each line (cancellation, return, RTO). */
export const restockLines = async ({ lines, referenceId, referenceType = "order", keyPrefix, reason, note = null, actor, strict = false, session }) => {
  requireSession(session);
  for (const line of lines) {
    const idempotencyKey = keyPrefix ? `${keyPrefix}:${skuIdOf(line)}` : undefined;
    if (await alreadyApplied(idempotencyKey, session)) continue;
    const doc = await moveStock({ ...line, stockDelta: line.quantity, session });
    // A SKU deleted since the sale has nowhere to go back to.
    if (!doc && strict) throw StatusError.conflict("Return product no longer exists");
    if (!doc || doc.manage_stock === false) continue;
    await writeLedger({ doc, line, delta: line.quantity, type: "restock", reason, note, referenceId, referenceType, idempotencyKey, actor, session });
  }
};

// ─── Order-level operations ────────────────────────────────────────────────

const orderLines = async (order, session) =>
  linesFromItems(await OrderItem.find({ order_id: order._id }).session(session));

const commitKeyPrefix = (order) => `order:${order._id}:commit:${order.stock_epoch || 0}`;
const restockKeyPrefix = (order) => `order:${order._id}:restock:${order.stock_epoch || 0}`;

export const getReservationTtlMinutes = async () => {
  const setting = await SiteSetting.findOne({ slug: RESERVATION_TTL_SETTING_SLUG }).lean();
  const value = parseInt(setting?.value, 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_RESERVATION_TTL_MINUTES;
};

/**
 * Holds stock for an unpaid (prepaid / partial COD) order until `expiresAt`.
 * Guarded on available stock, so two checkouts can't both hold the last unit.
 */
export const reserveOrder = async ({ order, items = null, expiresAt, session }) => {
  requireSession(session);
  const lines = items ? linesFromItems(items) : await orderLines(order, session);
  const epoch = order.stock_epoch || 0;
  for (const line of lines) {
    const doc = await moveStock({ ...line, reservedDelta: line.quantity, guard: sellableGuard(line.quantity), session });
    if (!doc) throw outOfStock(line);
    await StockReservation.create([{
      order: order._id,
      product: line.product,
      variation: line.variation || null,
      quantity: line.quantity,
      expires_at: expiresAt,
      epoch,
    }], { session });
  }
  await Order.updateOne(
    { _id: order._id },
    { $set: { stock_state: ORDER_STOCK_STATE.RESERVED, reservation_expires_at: expiresAt } },
    { session },
  );
};

/**
 * Converts an order's active reservations into a sale: on-hand and reserved
 * both drop by the held quantity. A line whose reserved count drifted falls
 * back to a plain guarded sale.
 */
export const commitReservation = async ({ order, actor, session }) => {
  requireSession(session);
  const reservations = await StockReservation.find({ order: order._id, status: RESERVATION_STATUS.ACTIVE }).session(session);
  const lines = await orderLines(order, session);
  const priceBySku = new Map(lines.map((l) => [skuIdOf(l), l]));
  const keyPrefix = commitKeyPrefix(order);

  for (const reservation of reservations) {
    const line = {
      ...priceBySku.get(skuIdOf(reservation)),
      product: reservation.product,
      variation: reservation.variation,
      quantity: reservation.quantity,
    };
    const idempotencyKey = `${keyPrefix}:${skuIdOf(line)}`;
    if (!(await alreadyApplied(idempotencyKey, session))) {
      let doc = await moveStock({
        ...line,
        stockDelta: -line.quantity,
        reservedDelta: -line.quantity,
        guard: { reserved_quantity: { $gte: line.quantity } },
        session,
      });
      if (!doc) doc = await moveStock({ ...line, stockDelta: -line.quantity, guard: sellableGuard(line.quantity), session });
      if (!doc) throw outOfStock(line);
      if (doc.manage_stock !== false) {
        await writeLedger({ doc, line, delta: -line.quantity, type: "sale", reason: STOCK_REASON.ORDER_SALE, referenceId: order._id, referenceType: "order", idempotencyKey, actor, session });
      }
    }
    reservation.status = RESERVATION_STATUS.COMMITTED;
    reservation.committed_at = new Date();
    await reservation.save({ session });
  }

  await markCommitted(order, session);
};

/**
 * Gives an unpaid order a fresh hold before a payment retry: extends an
 * active reservation, or re-reserves (under a new epoch) one that lapsed.
 * Throws OUT_OF_STOCK if the lapsed units have since been sold.
 */
export const renewReservation = async ({ order, expiresAt, session }) => {
  requireSession(session);
  if (order.stock_state === ORDER_STOCK_STATE.COMMITTED) return;
  if (order.stock_state === ORDER_STOCK_STATE.RESERVED) {
    await StockReservation.updateMany(
      { order: order._id, status: RESERVATION_STATUS.ACTIVE },
      { $set: { expires_at: expiresAt } },
      { session },
    );
    await Order.updateOne({ _id: order._id }, { $set: { reservation_expires_at: expiresAt } }, { session });
    return;
  }
  const bumped = await Order.findOneAndUpdate({ _id: order._id }, { $inc: { stock_epoch: 1 } }, { new: true, session });
  await reserveOrder({ order: bumped, expiresAt, session });
};

/** Frees an order's active reservations without touching on-hand. */
export const releaseReservation = async ({ order, reason, session }) => {
  requireSession(session);
  const reservations = await StockReservation.find({ order: order._id, status: RESERVATION_STATUS.ACTIVE }).session(session);
  for (const reservation of reservations) {
    // Claim first so a concurrent release can't double-decrement.
    const claimed = await StockReservation.findOneAndUpdate(
      { _id: reservation._id, status: RESERVATION_STATUS.ACTIVE },
      { $set: { status: RESERVATION_STATUS.RELEASED, released_reason: reason, released_at: new Date() } },
      { session },
    );
    if (!claimed) continue;
    await moveStock({ product: reservation.product, variation: reservation.variation, reservedDelta: -reservation.quantity, session });
  }
  await Order.updateOne(
    { _id: order._id, stock_state: ORDER_STOCK_STATE.RESERVED },
    { $set: { stock_state: ORDER_STOCK_STATE.RELEASED, reservation_expires_at: null } },
    { session },
  );
  return reservations.length;
};

const markCommitted = (order, session) => Order.updateOne(
  { _id: order._id },
  { $set: { stock_state: ORDER_STOCK_STATE.COMMITTED, stock_reserved: true, inventory_reverted: false, reservation_expires_at: null } },
  { session },
);

/** Sells an order's items straight from available stock (no prior hold). */
export const commitOrder = async ({ order, items = null, actor, session }) => {
  requireSession(session);
  const lines = items ? linesFromItems(items) : await orderLines(order, session);
  await commitLines({ lines, referenceId: order._id, referenceType: "order", keyPrefix: commitKeyPrefix(order), actor, session });
  await markCommitted(order, session);
};

/**
 * Undoes whatever stock an order holds: releases a reservation, or puts
 * committed units back on hand. Safe to call on any stock_state.
 */
export const revertOrderStock = async ({ order, reason = STOCK_REASON.ORDER_CANCEL, actor, session }) => {
  requireSession(session);
  const state = order.stock_state
    || (order.stock_reserved && !order.inventory_reverted ? ORDER_STOCK_STATE.COMMITTED : ORDER_STOCK_STATE.NONE);

  if (state === ORDER_STOCK_STATE.RESERVED) {
    await releaseReservation({ order, reason, session });
    return ORDER_STOCK_STATE.RELEASED;
  }
  // Legacy orders committed before stock_state existed carry only the flags.
  const committed = state === ORDER_STOCK_STATE.COMMITTED
    || (state === ORDER_STOCK_STATE.NONE && order.stock_reserved && !order.inventory_reverted);
  if (!committed) return state;

  const lines = await orderLines(order, session);
  await restockLines({ lines, referenceId: order._id, referenceType: "order", keyPrefix: restockKeyPrefix(order), reason, actor, session });
  await Order.updateOne(
    { _id: order._id },
    { $set: { stock_state: ORDER_STOCK_STATE.RESTOCKED, inventory_reverted: true } },
    { session },
  );
  return ORDER_STOCK_STATE.RESTOCKED;
};

// ─── Manual adjustments ────────────────────────────────────────────────────

const loadSku = async ({ product, variation }, session) => {
  const doc = await modelFor(variation).findOne({ _id: variation || product }).session(session);
  if (!doc) throw StatusError.notFound("Product not found");
  if (variation && String(doc.product_id) !== String(product)) throw StatusError.badRequest("Variation does not belong to this product");
  if (!variation && doc.type === "variable") throw StatusError.badRequest("Adjust stock on a variation of a variable product");
  return doc;
};

/**
 * Applies a signed on-hand delta with a reason. `expectedOnHand`, when given,
 * is an optimistic-concurrency check: the move is refused (409) if on-hand
 * changed since the admin loaded it. On-hand may never drop below reserved.
 */
export const adjustStock = async ({
  product, variation = null, delta, reason, note = null, expectedOnHand = null,
  referenceType = "adjustment", referenceId = null, idempotencyKey, actor, session,
}) => {
  requireSession(session);
  const sku = { product, variation };
  const current = await loadSku(sku, session);
  if (!Number.isInteger(delta)) throw StatusError.badRequest("Quantity must be a whole number");
  if (expectedOnHand !== null && expectedOnHand !== undefined && Number(current.stock_quantity) !== Number(expectedOnHand)) {
    throw staleStock(current);
  }
  if (delta === 0) return { doc: current, delta: 0 };
  if (await alreadyApplied(idempotencyKey, session)) return { doc: current, delta: 0, replayed: true };

  const guard = {};
  if (expectedOnHand !== null && expectedOnHand !== undefined) guard.stock_quantity = Number(expectedOnHand);
  if (delta < 0) {
    guard.$expr = { $gte: [{ $add: ["$stock_quantity", delta] }, { $ifNull: ["$reserved_quantity", 0] }] };
  }
  const doc = await moveStock({ ...sku, stockDelta: delta, guard, session });
  if (!doc) {
    const fresh = await loadSku(sku, session);
    if (expectedOnHand !== null && expectedOnHand !== undefined && Number(fresh.stock_quantity) !== Number(expectedOnHand)) {
      throw staleStock(fresh);
    }
    throw StatusError.badRequest(
      `Cannot remove ${-delta} unit(s): ${fresh.reserved_quantity || 0} are reserved for unpaid orders and only ${fresh.stock_quantity} are on hand.`,
    );
  }
  await writeLedger({
    doc,
    line: { ...sku, cost_price: 0 },
    delta,
    type: delta > 0 && reason === STOCK_REASON.OPENING_BALANCE ? "opening_balance" : "adjustment",
    reason,
    note,
    referenceId,
    referenceType,
    idempotencyKey,
    actor,
    session,
  });
  return { doc, delta };
};

const staleStock = (doc) => {
  const err = StatusError.conflict("Stock changed since you loaded it. Reload and try again.");
  err.details = { code: "STOCK_CHANGED", stock_quantity: doc.stock_quantity, reserved_quantity: doc.reserved_quantity || 0 };
  return err;
};

/** Sets on-hand to a counted absolute value by posting the difference. */
export const setStockCount = async ({ count, ...rest }) => {
  requireSession(rest.session);
  if (!Number.isInteger(count) || count < 0) throw StatusError.badRequest("Count must be a whole number ≥ 0");
  const current = await loadSku(rest, rest.session);
  return adjustStock({ ...rest, delta: count - Number(current.stock_quantity || 0) });
};
