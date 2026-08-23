import ShippingRate from "../../models/ShippingRate.js";
import { resolveZone } from "./resolveZone.js";

/**
 * Compute the server-authoritative shipping charge + transit-time range for an order.
 * @param {{ items: {shipping_class: any, weight: number, quantity: number}[], address: {country?: number, state?: number, postcode?: string}, orderSubtotal: number }} params
 * @returns {Promise<{ amount: number, currency: string, zone: any, breakdown: any[], min_delivery_days: number|null, max_delivery_days: number|null }>}
 */
export const calculateShippingRate = async ({
  items = [],
  address = {},
  orderSubtotal = 0,
}) => {
  const zone = await resolveZone({
    country: address.country,
    state: address.state,
    postcode: address.postcode,
  });

  // No zone configured yet — fail open with zero shipping rather than blocking checkout.
  if (!zone) {
    return {
      amount: 0,
      currency: "INR",
      zone: null,
      breakdown: [],
      min_delivery_days: null,
      max_delivery_days: null,
    };
  }

  // Group cart/order items by their shipping class (null = unclassed)
  const classGroups = new Map();
  for (const item of items) {
    const classKey = item.shipping_class ? String(item.shipping_class) : "null";
    const group = classGroups.get(classKey) || {
      shipping_class: item.shipping_class || null,
      totalWeight: 0,
    };
    group.totalWeight += (item.weight || 0) * (item.quantity || 1);
    classGroups.set(classKey, group);
  }

  if (!classGroups.size) {
    classGroups.set("null", { shipping_class: null, totalWeight: 0 });
  }

  const rates = await ShippingRate.find({
    zone: zone._id,
    status: "active",
    deleted_at: null,
  }).lean();

  let amount = 0;
  let min_delivery_days = null;
  let max_delivery_days = null;
  const breakdown = [];

  for (const group of classGroups.values()) {
    const rate =
      rates.find(
        (r) =>
          r.shipping_class && String(r.shipping_class) === String(group.shipping_class)
      ) || rates.find((r) => !r.shipping_class);

    if (!rate) continue;

    const chargeableWeight = Math.max(
      0,
      group.totalWeight - (rate.free_weight_kg || 0)
    );
    let lineAmount =
      (rate.flat_rate || 0) + chargeableWeight * (rate.per_kg_rate || 0);

    if (
      rate.free_shipping_min_order_value != null &&
      orderSubtotal >= rate.free_shipping_min_order_value
    ) {
      lineAmount = 0;
    }

    amount += lineAmount;
    breakdown.push({
      shipping_class: group.shipping_class,
      weight: group.totalWeight,
      amount: lineAmount,
      min_delivery_days: rate.min_delivery_days,
      max_delivery_days: rate.max_delivery_days,
    });

    // The whole order ships together — take the slowest class's transit window.
    if (min_delivery_days === null || rate.min_delivery_days > min_delivery_days) {
      min_delivery_days = rate.min_delivery_days;
    }
    if (max_delivery_days === null || rate.max_delivery_days > max_delivery_days) {
      max_delivery_days = rate.max_delivery_days;
    }
  }

  return {
    amount: parseFloat(amount.toFixed(2)),
    currency: "INR",
    zone: { _id: zone._id, name: zone.name },
    breakdown,
    min_delivery_days,
    max_delivery_days,
  };
};
