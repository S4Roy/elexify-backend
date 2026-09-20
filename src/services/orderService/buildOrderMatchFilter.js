import mongoose from "mongoose";
import { sourceCondition } from "../legacyImport/filter.js";
import { StatusError } from "../../config/index.js";

// Shared between the Orders list (controllers/admin/inventory/order/list.js)
// and the Orders export, so "export what I'm currently looking at" can never
// drift from what the list actually shows.
export const buildOrderMatchFilter = (query, auth) => {
  const {
    order_status = "",
    search_key = "",
    customer_id = null,
    payment_status = null,
    payment_method = null,
    from_date = null,
    to_date = null,
  } = query;

  const importSource = query.import_source;
  if (importSource && !["backup", "other"].includes(importSource)) throw StatusError.badRequest("Invalid import source filter");

  const matchFilter = { deleted_at: null };
  if (importSource) matchFilter.$and = [sourceCondition(importSource, [])];
  if (auth?.role === "customer") {
    matchFilter.user = new mongoose.Types.ObjectId(auth.user_id);
  } else if (customer_id) {
    matchFilter.user = new mongoose.Types.ObjectId(customer_id);
  }
  if (order_status) matchFilter.order_status = { $in: order_status.split(",") };
  if (payment_status) matchFilter.payment_status = { $in: payment_status.split(",") };
  if (payment_method) matchFilter.payment_method = { $in: payment_method.split(",") };
  if (from_date || to_date) {
    matchFilter.created_at = {};
    if (from_date) matchFilter.created_at.$gte = new Date(from_date);
    if (to_date) {
      const end = new Date(to_date);
      end.setHours(23, 59, 59, 999);
      matchFilter.created_at.$lte = end;
    }
  }
  if (search_key) {
    matchFilter.$or = [
      { id: { $regex: search_key, $options: "i" } },
      { transaction_id: { $regex: search_key, $options: "i" } },
      { order_status: { $regex: search_key, $options: "i" } },
    ];
  }
  return matchFilter;
};
