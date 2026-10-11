import mongoose from "mongoose";
import Order from "../../models/Order.js";
import CashHandover from "../../models/CashHandover.js";
import { StatusError } from "../../config/index.js";

// COD cash collected by our own riders stays "pending" on the order
// (cod_collection.handover) until the rider hands it in at the office.
// A handover settles a set of the rider's pending orders in one record and
// keeps any shortage/excess against the rider — the cash equivalent of a
// courier's COD remittance (codRemittance.js).

const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const PENDING = { deleted_at: null, "cod_collection.handover.status": "pending" };

// Riders with a staff login are keyed by account; ad-hoc riders (name only,
// no login) by the name the office typed at dispatch.
const riderFilter = ({ riderUserId = null, riderName = null }) => {
  if (riderUserId) {
    if (!mongoose.Types.ObjectId.isValid(riderUserId)) throw StatusError.badRequest("Invalid rider");
    return { "cod_collection.collected_by_user": new mongoose.Types.ObjectId(String(riderUserId)) };
  }
  if (riderName?.trim()) return { "cod_collection.collected_by_user": null, "cod_collection.collected_by": riderName.trim() };
  throw StatusError.badRequest("Choose a rider");
};

/** Cash still with each rider, oldest collection first. */
export const riderCashSummary = async () => {
  const riders = await Order.aggregate([
    { $match: PENDING },
    { $group: {
      _id: { user: "$cod_collection.collected_by_user", name: "$cod_collection.collected_by" },
      order_count: { $sum: 1 },
      amount: { $sum: "$cod_collection.amount" },
      oldest_collected_at: { $min: "$cod_collection.collected_at" },
    } },
    { $sort: { oldest_collected_at: 1 } },
  ]);
  const recent = await CashHandover.find().sort({ received_at: -1 }).limit(20)
    .select("rider_user_id rider_name order_count amount_expected amount_received discrepancy note received_at").lean();
  return {
    total_pending: round(riders.reduce((s, r) => s + r.amount, 0)),
    riders: riders.map((r) => ({
      rider_user_id: r._id.user || null,
      rider_name: r._id.name || "Unknown rider",
      order_count: r.order_count,
      amount: round(r.amount),
      oldest_collected_at: r.oldest_collected_at,
    })),
    recent_handovers: recent,
  };
};

/** The rider's individual pending cash orders. */
export const pendingRiderCash = async (rider) => {
  const orders = await Order.find({ ...PENDING, ...riderFilter(rider) })
    .sort({ "cod_collection.collected_at": 1 })
    .select("id cod_collection.amount cod_collection.collected_at currency").lean();
  return orders.map((o) => ({
    _id: o._id, id: o.id, currency: o.currency || "INR",
    amount: round(o.cod_collection.amount), collected_at: o.cod_collection.collected_at,
  }));
};

/** Total a signed-in rider is currently holding (shown on My Deliveries). */
export const cashInHand = async (riderUserId) => {
  const orders = await pendingRiderCash({ riderUserId });
  return { amount: round(orders.reduce((s, o) => s + o.amount, 0)), order_count: orders.length };
};

/**
 * Records cash handed in by a rider for the given orders. Every order must
 * still be pending and belong to that rider; a short/excess amount is
 * accepted and kept as the handover's discrepancy.
 */
export const receiveRiderCash = async ({ riderUserId = null, riderName = null, orderIds, amountReceived, note = null, adminId }) => {
  const ids = [...new Set((orderIds || []).map(String))];
  if (!ids.length) throw StatusError.badRequest("Select the orders whose cash is being handed in");
  if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) throw StatusError.badRequest("Invalid order");
  const received = Number(amountReceived);
  if (!Number.isFinite(received) || received < 0) throw StatusError.badRequest("Enter the amount received");

  const session = await mongoose.startSession();
  try {
    let handover;
    await session.withTransaction(async () => {
      const filter = { ...PENDING, ...riderFilter({ riderUserId, riderName }), _id: { $in: ids } };
      const orders = await Order.find(filter).select("_id cod_collection").session(session);
      if (orders.length !== ids.length) {
        throw StatusError.conflict("Some orders are no longer pending with this rider. Refresh and try again.");
      }
      const expected = round(orders.reduce((s, o) => s + Number(o.cod_collection.amount || 0), 0));
      const now = new Date();
      [handover] = await CashHandover.create([{
        rider_user_id: riderUserId || null,
        rider_name: riderName?.trim() || orders[0].cod_collection.collected_by || "Unknown rider",
        order_ids: orders.map((o) => o._id),
        order_count: orders.length,
        amount_expected: expected,
        amount_received: round(received),
        discrepancy: round(received - expected),
        note: note?.trim() || null,
        received_by: adminId,
        received_at: now,
      }], { session });
      const result = await Order.updateMany(filter, { $set: {
        "cod_collection.handover.status": "received",
        "cod_collection.handover.handover_id": handover._id,
        "cod_collection.handover.received_at": now,
      } }, { session });
      if (result.modifiedCount !== ids.length) {
        throw StatusError.conflict("Some orders changed while recording. Refresh and try again.");
      }
    });
    return handover;
  } finally {
    await session.endSession();
  }
};
