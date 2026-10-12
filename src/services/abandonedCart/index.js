import mongoose from "mongoose";
import Cart from "../../models/Cart.js";
// Registered for Cart.populate() below.
import "../../models/Product.js";
import "../../models/ProductVariation.js";
import "../../models/Media.js";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import DeviceToken from "../../models/DeviceToken.js";
import NotificationPreference from "../../models/NotificationPreference.js";
import AbandonedCart from "../../models/AbandonedCart.js";
import AbandonedCartSettings from "../../models/AbandonedCartSettings.js";
import { envs } from "../../config/index.js";
import { emailBrand } from "../../config/emailBrand.js";
import { sendNotification } from "../notification/sendNotification.js";
import { isConfigured as whatsappConfigured } from "../notification/whatsapp.provider.js";
import { pushConfig } from "../notification/push/config.js";

// Abandoned-cart recovery, run on a cron tick (runAbandonedCartCycle):
//   1. resolve — close open episodes whose customer ordered (recovered),
//      emptied their cart, or went idle past the expiry window (expired);
//   2. detect  — open/refresh an episode for every signed-in cart idle past
//      the abandonment threshold, snapshotting items and value;
//   3. remind  — when automation is on, send the next due step of the
//      reminder sequence (respecting opt-in, min value and frequency cap).
// Reminders go through sendNotification("ABANDONED_CART"), so customer
// preferences (reminders.abandoned_cart_* / marketing.push) always apply —
// neither the cron nor an admin can message a customer who hasn't opted in.

const HOUR = 3_600_000;
const EMAIL_ITEM_LIMIT = 5;
// Orders that haven't been paid/confirmed (or were cancelled) don't count
// as a recovery yet.
const NON_RECOVERING_STATUSES = ["pending", "cancelled"];

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};
const round2 = (value) => Math.round(value * 100) / 100;

export const getSettings = () => AbandonedCartSettings.getSingleton();

// Latest activity per signed-in customer with a live cart.
const cartActivityByUser = async () => {
  const rows = await Cart.aggregate([
    { $match: { user: { $type: "objectId" }, deleted_at: null } },
    { $group: { _id: "$user", last_activity_at: { $max: "$updatedAt" } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.last_activity_at]));
};

// Item snapshot + value for the given customers' live carts.
const snapshotCarts = async (userIds) => {
  const snapshots = new Map();
  for (const ids of chunk(userIds, 200)) {
    const rows = await Cart.find({ user: { $in: ids }, deleted_at: null })
      .populate({ path: "product", select: "name images", populate: { path: "images", select: "url" } })
      .populate({ path: "variation", select: "combination_display" })
      .sort({ updatedAt: -1 })
      .lean();
    for (const row of rows) {
      const key = String(row.user);
      if (!snapshots.has(key)) snapshots.set(key, { items: [], item_count: 0, cart_value: 0 });
      const snap = snapshots.get(key);
      const unitPrice = Number(row.discounted_price ?? row.price) || 0;
      const quantity = Number(row.quantity) || 1;
      const media = row.product?.images?.[0]?.url;
      snap.items.push({
        product_id: row.product?._id ?? row.product,
        variation_id: row.variation?._id ?? null,
        product_name: row.product?.name || "Product",
        variation_name: row.variation?.combination_display || null,
        image: media ? `${envs.s3.BASE_URL}${media}` : null,
        quantity,
        unit_price: round2(unitPrice),
        total_price: round2(unitPrice * quantity),
      });
      snap.item_count += quantity;
      snap.cart_value = round2(snap.cart_value + unitPrice * quantity);
    }
  }
  return snapshots;
};

const resolveOpenEpisodes = async (activity, settings, now) => {
  const open = await AbandonedCart.find({ status: "open" })
    .select("user_id abandoned_at reminders last_activity_at")
    .lean();
  if (!open.length) return { recovered: 0, expired: 0 };

  const earliest = new Date(Math.min(...open.map((row) => row.abandoned_at.getTime())));
  const orders = await Order.find({
    user: { $in: open.map((row) => row.user_id) },
    created_at: { $gte: earliest },
    deleted_at: null,
    order_status: { $nin: NON_RECOVERING_STATUSES },
  }).select("user id created_at grand_total").sort({ created_at: 1 }).lean();
  const ordersByUser = new Map();
  for (const order of orders) {
    const key = String(order.user);
    if (!ordersByUser.has(key)) ordersByUser.set(key, []);
    ordersByUser.get(key).push(order);
  }

  const staleBefore = now.getTime() - settings.expire_after_days * 24 * HOUR;
  let recovered = 0;
  let expired = 0;
  for (const row of open) {
    const key = String(row.user_id);
    const order = ordersByUser.get(key)?.find((o) => o.created_at >= row.abandoned_at);
    if (order) {
      const result = await AbandonedCart.updateOne({ _id: row._id, status: "open" }, { $set: {
        status: "recovered",
        closed_reason: "ordered",
        recovered_at: order.created_at,
        recovered_order_id: order._id,
        recovered_order_number: order.id,
        recovered_value: order.grand_total,
        recovered_via_reminder: (row.reminders || []).some((r) => r.channels?.length && r.sent_at <= order.created_at),
      } });
      recovered += result.modifiedCount;
      continue;
    }
    const lastActivity = activity.get(key);
    const reason = !lastActivity ? "cart_emptied" : lastActivity.getTime() < staleBefore ? "stale" : null;
    if (reason) {
      const result = await AbandonedCart.updateOne({ _id: row._id, status: "open" }, {
        $set: { status: "expired", closed_reason: reason },
      });
      expired += result.modifiedCount;
    }
  }
  return { recovered, expired };
};

const detectEpisodes = async (activity, settings, now) => {
  const abandonedBefore = now.getTime() - settings.abandon_after_minutes * 60_000;
  const staleBefore = now.getTime() - settings.expire_after_days * 24 * HOUR;
  const candidates = [...activity.entries()]
    .filter(([, at]) => at.getTime() <= abandonedBefore && at.getTime() >= staleBefore)
    .map(([userId]) => userId);
  if (!candidates.length) return { opened: 0, refreshed: 0 };

  const [openRows, closedRows] = await Promise.all([
    AbandonedCart.find({ user_id: { $in: candidates }, status: "open" }).select("user_id last_activity_at").lean(),
    // The latest closed episode per customer: an idle cart that was already
    // recovered/expired must not immediately reopen (e.g. a direct "Buy now"
    // order leaves the cart untouched) — only new cart activity does.
    AbandonedCart.aggregate([
      { $match: { user_id: { $in: candidates.map((id) => new mongoose.Types.ObjectId(id)) }, status: { $ne: "open" } } },
      { $group: { _id: "$user_id", closed_at: { $max: { $ifNull: ["$recovered_at", "$updated_at"] } }, last_activity_at: { $max: "$last_activity_at" } } },
    ]),
  ]);
  const openByUser = new Map(openRows.map((row) => [String(row.user_id), row]));
  const closedByUser = new Map(closedRows.map((row) => [String(row._id), row]));

  const toSnapshot = candidates.filter((userId) => {
    const at = activity.get(userId);
    const existing = openByUser.get(userId);
    if (existing) return existing.last_activity_at.getTime() !== at.getTime();
    const closed = closedByUser.get(userId);
    return !closed || (at > closed.closed_at && at > closed.last_activity_at);
  });
  const snapshots = await snapshotCarts(toSnapshot);

  let opened = 0;
  let refreshed = 0;
  for (const userId of toSnapshot) {
    const snap = snapshots.get(userId);
    if (!snap?.items.length) continue;
    const lastActivity = activity.get(userId);
    if (openByUser.has(userId)) {
      await AbandonedCart.updateOne({ user_id: userId, status: "open" }, { $set: { ...snap, last_activity_at: lastActivity } });
      refreshed++;
    } else {
      try {
        await AbandonedCart.create({ user_id: userId, abandoned_at: lastActivity, last_activity_at: lastActivity, ...snap });
        opened++;
      } catch (error) {
        if (error?.code !== 11000) throw error; // another tick opened it first
      }
    }
  }
  return { opened, refreshed };
};

/**
 * Which channels each customer can receive a cart reminder on right now —
 * the same rules sendNotification applies (verified contact + opt-in), plus
 * push (marketing.push consent + an active device).
 */
export const getReachability = async (userIds) => {
  const ids = [...new Set(userIds.map(String))];
  const result = new Map(ids.map((id) => [id, { email: false, whatsapp: false, push: false }]));
  if (!ids.length) return result;
  const push = await pushConfig().catch(() => null);
  const [users, prefs, devices] = await Promise.all([
    User.find({ _id: { $in: ids }, deleted_at: null }).select("email email_verified_at mobile mobile_verified_at").lean(),
    NotificationPreference.find({ user_id: { $in: ids } }).select("user_id reminders marketing").lean(),
    push?.enabled
      ? DeviceToken.distinct("user_id", { user_id: { $in: ids }, environment: push.environment, is_active: true })
      : [],
  ]);
  const prefsByUser = new Map(prefs.map((p) => [String(p.user_id), p]));
  const withDevice = new Set(devices.map(String));
  const whatsapp = whatsappConfigured();
  for (const user of users) {
    const key = String(user._id);
    const pref = prefsByUser.get(key);
    result.set(key, {
      email: !!(user.email && user.email_verified_at && pref?.reminders?.abandoned_cart_email),
      whatsapp: !!(whatsapp && user.mobile && user.mobile_verified_at && pref?.reminders?.abandoned_cart_whatsapp),
      push: !!(pref?.marketing?.push && withDevice.has(key)),
    });
  }
  return result;
};

const cartUrl = () => `${emailBrand.storefrontUrl}/cart`;

const reminderData = (episode, couponCode) => ({
  cart_url: cartUrl(),
  item_count: episode.item_count,
  cart_total: episode.cart_value,
  items: episode.items.slice(0, EMAIL_ITEM_LIMIT).map((item) => ({
    product_name: item.product_name,
    variation_name: item.variation_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
  })),
  more_items_count: Math.max(0, episode.items.length - EMAIL_ITEM_LIMIT),
  coupon_code: couponCode || null,
});

/**
 * Queues one reminder for an open episode on every channel the customer has
 * opted into. Returns the channels queued (empty when none is reachable).
 */
export const deliverReminder = async (episode, { kind, step = null, couponCode = null, actorId = null }) => {
  const reach = (await getReachability([episode.user_id])).get(String(episode.user_id));
  const sequence = kind === "auto" ? `auto:${step}` : `manual:${episode.reminders?.length || 0}`;
  let channels = [];
  if (reach && (reach.email || reach.whatsapp || reach.push)) {
    const result = await sendNotification({
      userId: episode.user_id,
      event: "ABANDONED_CART",
      data: reminderData(episode, couponCode),
      dedupeKey: `${episode._id}:${sequence}`,
    });
    channels = (result?.results || []).filter((r) => r.queued).map((r) => r.channel);
    if (reach.push) channels.push("push");
  }
  const now = new Date();
  await AbandonedCart.updateOne({ _id: episode._id }, {
    $push: { reminders: { kind, step, channels, sent_at: now, sent_by: actorId, coupon_code: couponCode || null } },
    ...(channels.length ? { $set: { last_reminder_at: now } } : {}),
  });
  return channels;
};

const sendDueReminders = async (activity, settings, now) => {
  const steps = settings.steps || [];
  if (!settings.auto_reminders_enabled || !steps.some((s) => s.enabled)) return { reminded: 0 };
  const abandonedBefore = new Date(now.getTime() - settings.abandon_after_minutes * 60_000);
  const episodes = await AbandonedCart.find({
    status: "open",
    cart_value: { $gte: settings.min_cart_value || 0 },
    last_activity_at: { $lte: abandonedBefore },
    auto_steps_sent: { $lt: steps.length },
  }).sort({ last_activity_at: 1 }).limit(200).lean();

  const gap = (settings.min_hours_between_reminders || 0) * HOUR;
  let reminded = 0;
  for (const episode of episodes) {
    let index = episode.auto_steps_sent;
    while (index < steps.length && !steps[index].enabled) index++;
    const step = steps[index];
    if (!step) {
      await AbandonedCart.updateOne({ _id: episode._id, auto_steps_sent: episode.auto_steps_sent }, { $set: { auto_steps_sent: steps.length } });
      continue;
    }
    // Use the live cart activity: a customer who came back and is editing
    // their cart right now must not be reminded about it.
    const lastActivity = activity.get(String(episode.user_id));
    if (!lastActivity || lastActivity > abandonedBefore) continue;
    if (now.getTime() < lastActivity.getTime() + step.delay_hours * HOUR) continue;
    if (episode.last_reminder_at && now.getTime() - episode.last_reminder_at.getTime() < gap) continue;
    // Claim the step first so overlapping ticks (or API instances) can't
    // both send it.
    const claim = await AbandonedCart.updateOne(
      { _id: episode._id, status: "open", auto_steps_sent: episode.auto_steps_sent },
      { $set: { auto_steps_sent: index + 1 } },
    );
    if (!claim.modifiedCount) continue;
    const channels = await deliverReminder(episode, { kind: "auto", step: index + 1, couponCode: step.coupon_code });
    if (channels.length) reminded++;
  }
  return { reminded };
};

export const runAbandonedCartCycle = async (now = new Date()) => {
  const settings = await getSettings();
  const activity = await cartActivityByUser();
  const resolved = await resolveOpenEpisodes(activity, settings, now);
  const detected = await detectEpisodes(activity, settings, now);
  const sent = await sendDueReminders(activity, settings, now);
  return { ...resolved, ...detected, ...sent };
};
