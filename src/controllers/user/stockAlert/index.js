import mongoose from "mongoose";
import { StatusError } from "../../../config/index.js";
import StockAlertSubscription from "../../../models/StockAlertSubscription.js";
import { subscribe as subscribeToItem, unsubscribe as unsubscribeFromItem } from "../../../services/stockAlerts/index.js";

// "Notify me when available" for out-of-stock products — see
// services/stockAlerts. Signed-in customers only (/user routes require a
// session), so the alert can reach a verified contact.
const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || ""));

const readItem = (source) => {
  const productId = source?.product_id;
  const variationId = source?.variation_id || null;
  if (!isId(productId) || (variationId && !isId(variationId))) {
    throw StatusError.badRequest("A valid product is required.");
  }
  return { productId, variationId };
};

const userId = (req) => {
  if (!req.auth?.user_id) throw StatusError.unauthorized("Please sign in to get notified.");
  return req.auth.user_id;
};

// GET ?product_id=&variation_id= → whether this item has a live request;
// without product_id → the customer's live requests.
export const list = async (req, res, next) => {
  try {
    const user = userId(req);
    if (req.query.product_id) {
      const { productId, variationId } = readItem(req.query);
      const exists = await StockAlertSubscription.exists({ user_id: user, product_id: productId, variation_id: variationId, status: "active" });
      return res.status(200).json({ status: "success", data: { subscribed: !!exists } });
    }
    const items = await StockAlertSubscription.find({ user_id: user, status: "active" })
      .populate({ path: "product_id", select: "name slug" })
      .populate({ path: "variation_id", select: "combination_display" })
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
    return res.status(200).json({ status: "success", data: items.map((s) => ({
      _id: s._id,
      product_id: s.product_id?._id,
      product_name: s.product_id?.name,
      product_slug: s.product_id?.slug,
      variation_id: s.variation_id?._id || null,
      variation_name: s.variation_id?.combination_display || null,
      created_at: s.created_at,
    })) });
  } catch (error) { next(error); }
};

export const subscribe = async (req, res, next) => {
  try {
    const { productId, variationId } = readItem(req.body);
    const source = req.headers?.["x-auth-client"] === "native" ? "app" : "web";
    const result = await subscribeToItem({ userId: userId(req), productId, variationId, source });
    if (result.error === "not_found") throw StatusError.notFound("This product is no longer available.");
    if (result.error === "variation_required") throw StatusError.badRequest("Choose an option first.");
    if (result.error === "in_stock") throw StatusError.conflict("Good news — this item is in stock. You can order it now.");
    res.status(200).json({ status: "success", message: "We'll let you know as soon as it's back in stock.", data: { subscribed: true } });
  } catch (error) { next(error); }
};

export const unsubscribe = async (req, res, next) => {
  try {
    const { productId, variationId } = readItem(req.query);
    await unsubscribeFromItem({ userId: userId(req), productId, variationId });
    res.status(200).json({ status: "success", message: "You won't be notified about this item.", data: { subscribed: false } });
  } catch (error) { next(error); }
};
