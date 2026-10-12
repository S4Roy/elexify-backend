import mongoose from "mongoose";
import AbandonedCart from "../../models/AbandonedCart.js";
import { envs, StatusError } from "../../config/index.js";
import { auditService } from "../../services/index.js";
import { deliverReminder, getReachability, getSettings } from "../../services/abandonedCart/index.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MANUAL_COOLDOWN_MS = 60 * 60 * 1000;
const BULK_LIMIT = 100;

const dateRange = (from, to) => {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
};

// Admin "Abandoned Carts" list — episodes maintained by
// services/abandonedCart, joined with the customer and annotated with the
// channels each customer can currently be reminded on.
export const list = async (req, res, next) => {
  try {
    const { page = 1, limit = envs.pagination.limit, status, from, to, min_value, max_value, reminded, search, sort } = req.query;
    const match = {};
    if (["open", "recovered", "expired"].includes(status)) match.status = status;
    const range = dateRange(from, to);
    if (range) match.abandoned_at = range;
    if (min_value || max_value) {
      match.cart_value = {};
      if (min_value) match.cart_value.$gte = Number(min_value);
      if (max_value) match.cart_value.$lte = Number(max_value);
    }
    if (reminded === "yes") match["reminders.channels.0"] = { $exists: true };
    if (reminded === "no") match["reminders.channels.0"] = { $exists: false };

    const pipeline = [
      { $match: match },
      { $sort: sort === "value" ? { cart_value: -1, _id: -1 } : { last_activity_at: -1, _id: -1 } },
      { $lookup: { from: "users", localField: "user_id", foreignField: "_id", as: "customer" } },
      { $addFields: { customer: { $arrayElemAt: ["$customer", 0] } } },
    ];
    const term = search ? String(search).trim() : "";
    if (term) {
      const regex = new RegExp(escapeRegex(term), "i");
      pipeline.push({ $match: { $or: [
        { "customer.name": regex }, { "customer.email": regex }, { "customer.mobile": regex },
        { "items.product_name": regex }, { recovered_order_number: regex },
      ] } });
    }
    pipeline.push({ $project: {
      user_id: 1, status: 1, abandoned_at: 1, last_activity_at: 1, items: 1, item_count: 1, cart_value: 1, currency: 1,
      reminders: 1, auto_steps_sent: 1, last_reminder_at: 1, recovered_at: 1, recovered_order_id: 1,
      recovered_order_number: 1, recovered_value: 1, recovered_via_reminder: 1, closed_reason: 1,
      "customer._id": 1, "customer.name": 1, "customer.email": 1, "customer.phone_code": 1, "customer.mobile": 1,
    } });

    const data = await AbandonedCart.aggregatePaginate(AbandonedCart.aggregate(pipeline), { page, limit });
    const reach = await getReachability(data.docs.map((doc) => doc.user_id));
    data.docs = data.docs.map((doc) => ({
      ...doc,
      reachable: reach.get(String(doc.user_id)) || { email: false, whatsapp: false, push: false },
    }));
    res.status(200).json({ status: "success", message: "Abandoned carts fetched successfully", data });
  } catch (error) { next(error); }
};

// KPI tiles for the selected abandonment window (default: last 30 days).
export const stats = async (req, res, next) => {
  try {
    const range = dateRange(req.query.from, req.query.to) || { $gte: new Date(Date.now() - 30 * 86400000) };
    const [row] = await AbandonedCart.aggregate([
      { $match: { abandoned_at: range } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        total_value: { $sum: "$cart_value" },
        open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
        open_value: { $sum: { $cond: [{ $eq: ["$status", "open"] }, "$cart_value", 0] } },
        recovered: { $sum: { $cond: [{ $eq: ["$status", "recovered"] }, 1, 0] } },
        recovered_value: { $sum: { $cond: [{ $eq: ["$status", "recovered"] }, { $ifNull: ["$recovered_value", 0] }, 0] } },
        recovered_via_reminder: { $sum: { $cond: ["$recovered_via_reminder", 1, 0] } },
        recovered_via_reminder_value: { $sum: { $cond: ["$recovered_via_reminder", { $ifNull: ["$recovered_value", 0] }, 0] } },
        reminded: { $sum: { $cond: [{ $gt: [{ $size: { $filter: { input: "$reminders", cond: { $gt: [{ $size: "$$this.channels" }, 0] } } } }, 0] }, 1, 0] } },
        reminders_sent: { $sum: { $size: { $filter: { input: "$reminders", cond: { $gt: [{ $size: "$$this.channels" }, 0] } } } } },
      } },
    ]);
    const s = row || { total: 0, total_value: 0, open: 0, open_value: 0, recovered: 0, recovered_value: 0,
      recovered_via_reminder: 0, recovered_via_reminder_value: 0, reminded: 0, reminders_sent: 0 };
    delete s._id;
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    res.status(200).json({ status: "success", message: "Abandoned cart stats fetched successfully", data: {
      ...s,
      recovery_rate: pct(s.recovered, s.total),
      reminder_recovery_rate: pct(s.recovered_via_reminder, s.reminded),
    } });
  } catch (error) { next(error); }
};

// Sends a reminder now to one or more open carts (bulk = ids[]), on every
// channel each customer has opted into. Customers who haven't opted in, or
// were reminded within the last hour, are skipped and reported back.
export const remind = async (req, res, next) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String))]
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!ids.length) throw StatusError.badRequest("Select at least one abandoned cart.");
    if (ids.length > BULK_LIMIT) throw StatusError.badRequest(`You can remind up to ${BULK_LIMIT} carts at a time.`);
    const couponCode = req.body?.coupon_code ? String(req.body.coupon_code).trim().toUpperCase().slice(0, 40) : null;

    const episodes = await AbandonedCart.find({ _id: { $in: ids } }).lean();
    const reach = await getReachability(episodes.map((e) => e.user_id));
    const results = { sent: [], skipped: [] };
    for (const episode of episodes) {
      const id = String(episode._id);
      const r = reach.get(String(episode.user_id));
      if (episode.status !== "open") { results.skipped.push({ id, reason: `Cart is ${episode.status}` }); continue; }
      if (episode.last_reminder_at && Date.now() - new Date(episode.last_reminder_at).getTime() < MANUAL_COOLDOWN_MS) {
        results.skipped.push({ id, reason: "Reminded less than an hour ago" }); continue;
      }
      if (!r || !(r.email || r.whatsapp || r.push)) {
        results.skipped.push({ id, reason: "Customer hasn't opted in to cart reminders" }); continue;
      }
      const channels = await deliverReminder(episode, { kind: "manual", couponCode, actorId: req.auth?.user_id || null });
      if (channels.length) results.sent.push({ id, channels });
      else results.skipped.push({ id, reason: "No channel could be queued" });
      await auditService.recordAudit({
        userId: episode.user_id, event: "ABANDONED_CART_REMINDER_SENT", req, actorId: req.auth?.user_id || null,
        metadata: { abandoned_cart_id: id, channels, coupon_code: couponCode, cart_value: episode.cart_value },
      });
    }
    for (const id of ids) {
      if (!episodes.some((e) => String(e._id) === id)) results.skipped.push({ id, reason: "Not found" });
    }
    const message = results.sent.length
      ? `Reminder sent to ${results.sent.length} customer(s)${results.skipped.length ? `, ${results.skipped.length} skipped` : ""}.`
      : "No reminders were sent.";
    res.status(200).json({ status: "success", message, data: results });
  } catch (error) { next(error); }
};

export const getSettingsHandler = async (req, res, next) => {
  try {
    res.status(200).json({ status: "success", message: "Abandoned cart settings fetched successfully", data: await getSettings() });
  } catch (error) { next(error); }
};

export const updateSettings = async (req, res, next) => {
  try {
    const settings = await getSettings();
    const body = req.body || {};
    const before = settings.toObject();
    for (const key of ["auto_reminders_enabled", "abandon_after_minutes", "expire_after_days", "min_cart_value", "min_hours_between_reminders"]) {
      if (body[key] !== undefined) settings[key] = body[key];
    }
    if (Array.isArray(body.steps)) {
      if (!body.steps.length || body.steps.length > 5) throw StatusError.badRequest("Configure between 1 and 5 reminder steps.");
      const steps = body.steps.map((step) => ({
        enabled: step?.enabled !== false,
        delay_hours: Number(step?.delay_hours),
        coupon_code: step?.coupon_code ? String(step.coupon_code).trim() : null,
      }));
      if (steps.some((s, i) => i > 0 && s.delay_hours <= steps[i - 1].delay_hours)) {
        throw StatusError.badRequest("Each reminder step must be scheduled later than the previous one.");
      }
      settings.steps = steps;
    }
    try {
      await settings.save();
    } catch (error) {
      if (error?.name === "ValidationError") throw StatusError.badRequest(Object.values(error.errors)[0]?.message || "Invalid settings.");
      throw error;
    }
    await auditService.recordAudit({
      userId: null, event: "ABANDONED_CART_SETTINGS_UPDATED", req, actorId: req.auth?.user_id || null,
      metadata: { before: { auto_reminders_enabled: before.auto_reminders_enabled, steps: before.steps }, after: { auto_reminders_enabled: settings.auto_reminders_enabled, steps: settings.steps } },
    });
    res.status(200).json({ status: "success", message: "Abandoned cart settings saved", data: settings });
  } catch (error) { next(error); }
};
