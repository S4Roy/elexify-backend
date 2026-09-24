import mongoose from "mongoose";
import Order from "../../../../models/Order.js";
import Address from "../../../../models/Address.js";
import { StatusError } from "../../../../config/index.js";
import { buildOrderTracking } from "../../../../services/orderService/tracking/buildOrderTracking.js";

/**
 * GET /site/inventory/order/tracking?order_id=<_id>
 * Full tracking for one of the signed-in customer's own orders.
 */
export const tracking = async (req, res, next) => {
  try {
    const userId = req.auth?.user_id;
    const order = await Order.findOne({
      _id: new mongoose.Types.ObjectId(req.query.order_id),
      user: new mongoose.Types.ObjectId(userId),
      deleted_at: null,
    }).lean();
    if (!order) throw StatusError.notFound(req.__("Order not found"));

    res.status(200).json({
      status: "success",
      message: req.__("Tracking fetched successfully"),
      data: await buildOrderTracking(order),
    });
  } catch (error) {
    next(error);
  }
};

// "#ord-10705", "ORD-010705" and "10705" all mean the same order number.
const orderNumberCandidates = (value) => {
  const raw = String(value).trim().replace(/^#/, "");
  const upper = raw.toUpperCase();
  const set = new Set([raw, upper]);
  const digits = upper.replace(/^ORD-?/, "");
  if (/^\d+$/.test(digits)) set.add(`ORD-${digits.padStart(6, "0")}`);
  return [...set];
};

const lastTenDigits = (v) => String(v || "").replace(/\D/g, "").slice(-10);

/**
 * POST /site/inventory/order/track  { order_number, contact }
 * Public tracking (no login): the order number must be paired with the
 * email or mobile number on the order — its account or its shipping/billing
 * address. Mismatch and not-found return the same response so the endpoint
 * can't be used to discover which order numbers exist. Rate limited.
 */
export const trackPublic = async (req, res, next) => {
  try {
    const { order_number, contact } = req.body;
    const notFound = StatusError.notFound(
      req.__("We couldn't find an order with those details. Check the order number and the email or mobile number used for the order."),
    );

    const order = await Order.findOne({ id: { $in: orderNumberCandidates(order_number) }, deleted_at: null })
      .populate("user", "email mobile")
      .lean();
    if (!order) throw notFound;

    const addressDocs = [order.shipping_address_snapshot, order.billing_address_snapshot].filter(Boolean);
    if (!addressDocs.length) {
      const ids = [order.shipping_address, order.billing_address].filter(Boolean);
      if (ids.length) addressDocs.push(...(await Address.find({ _id: { $in: ids } }).select("email phone").lean()));
    }

    const value = String(contact).trim();
    let matches = false;
    if (value.includes("@")) {
      const email = value.toLowerCase();
      matches = [order.user?.email, ...addressDocs.map((a) => a.email)]
        .filter(Boolean)
        .some((e) => String(e).trim().toLowerCase() === email);
    } else {
      const phone = lastTenDigits(value);
      matches =
        phone.length === 10 &&
        [order.user?.mobile, ...addressDocs.map((a) => a.phone)].filter(Boolean).some((p) => lastTenDigits(p) === phone);
    }
    if (!matches) throw notFound;

    res.status(200).json({
      status: "success",
      message: req.__("Tracking fetched successfully"),
      data: await buildOrderTracking(order, { publicView: true }),
    });
  } catch (error) {
    next(error);
  }
};
