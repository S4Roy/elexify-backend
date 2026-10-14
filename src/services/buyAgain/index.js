import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import Cart from "../../models/Cart.js";
import { StatusError } from "../../config/index.js";
import { availableOf, isPurchasable } from "../stock/availability.js";
import { calculateQuantityDiscount } from "../inventory/cart/calculateQuantityDiscount.js";

const ownedItems = async (userId, orderId) => {
  if (!userId) throw StatusError.unauthorized("Please sign in to buy again.");
  const order = await Order.findOne({ _id: orderId, user: userId, deleted_at: null }).select("_id").lean();
  if (!order) throw StatusError.notFound("Order not found.");
  return OrderItem.find({ order_id: orderId }).lean();
};

const currentLine = async (userId, item) => {
  const line = {
    order_item_id: String(item._id),
    name: item.product_name || "Product",
    variation_name: item.variation_name || null,
    original_quantity: item.quantity,
    eligible: false,
    reason: null,
  };
  if (item.customization_id) return { line: { ...line, reason: "Customised item — please configure it again on the product page." } };
  const product = await Product.findById(item.product_id).lean();
  if (!product || product.deleted_at || product.status !== "active") {
    return { line: { ...line, reason: "This product is no longer available." } };
  }
  line.name = product.name;
  const variation = item.variation_id
    ? await ProductVariation.findOne({ _id: item.variation_id, product_id: product._id }).lean() : null;
  if ((product.type === "variable" && !variation) || (item.variation_id && (!variation || variation.deleted_at || variation.status !== "active")) || (product.type !== "variable" && item.variation_id)) {
    return { line: { ...line, reason: "The previously ordered variant is no longer available." } };
  }
  const source = variation || product;
  const filter = { user: userId, product: product._id, variation: variation?._id || null };
  const cart = await Cart.findOne(filter).lean();
  if (cart && !cart.deleted_at && cart.customization_id) {
    return { line: { ...line, reason: "A customised version is already in your cart. Please review it first." } };
  }
  const existingQuantity = cart && !cart.deleted_at ? cart.quantity : 0;
  const maxQuantity = Math.max(0, Math.min(100000 - existingQuantity,
    source.manage_stock === false || source.allow_backorders ? 100000 : availableOf(source) - existingQuantity));
  const regularPrice = Number(source.regular_price);
  if (source.regular_price == null || !Number.isFinite(regularPrice) || regularPrice < 0) {
    return { line: { ...line, reason: "Current pricing is unavailable." } };
  }
  const basePrice = source.sale_price > 0 && source.sale_price < regularPrice ? source.sale_price : regularPrice;
  return {
    line: { ...line, eligible: maxQuantity > 0 && isPurchasable(source, existingQuantity + 1),
      reason: maxQuantity > 0 ? null : "No additional units are available for your cart.",
      max_quantity: maxQuantity, existing_quantity: existingQuantity, base_price: basePrice,
      quantity_discounts: product.quantity_discounts || [], },
    product, source, filter, cart, regularPrice, basePrice, existingQuantity,
  };
};

export const previewBuyAgain = async (userId, orderId) => {
  const items = await ownedItems(userId, orderId);
  const lines = [];
  for (const item of items) lines.push((await currentLine(userId, item)).line);
  return { items: lines, currency: "INR" };
};

const addLine = async (userId, item, quantity) => {
  // Compare-and-set prevents overwriting a quantity changed in another tab.
  // A concurrent creation hits the existing unique cart index and is retried.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await currentLine(userId, item);
    if (!current.line.eligible) return { ...current.line, added: false };
    if (quantity > current.line.max_quantity) {
      return { ...current.line, added: false, reason: `Only ${current.line.max_quantity} additional unit(s) are available. Reduce the quantity and try again.` };
    }
    const newQuantity = current.existingQuantity + quantity;
    const discount = calculateQuantityDiscount({ basePrice: current.basePrice, quantity: newQuantity, tiers: current.product.quantity_discounts });
    const values = { quantity: newQuantity, price: current.regularPrice,
      discounted_price: discount.discountPercent > 0 || current.basePrice < current.regularPrice ? discount.unitPrice : null,
      discount_percent: discount.discountPercent || null, deleted_at: null,
      ...(current.cart?.deleted_at ? { customization_id: null } : {}), };
    try {
      if (current.cart) {
        const updated = await Cart.updateOne({ _id: current.cart._id, quantity: current.cart.quantity,
          deleted_at: current.cart.deleted_at ?? null, updatedAt: current.cart.updatedAt }, { $set: values });
        if (!updated.matchedCount) continue;
      } else {
        await Cart.create({ ...current.filter, ...values });
      }
      return { ...current.line, added: true, product_id: String(current.product._id), variation_id: current.source === current.product ? null : String(current.source._id), added_quantity: quantity, cart_quantity: newQuantity, unit_price: discount.unitPrice, reason: null };
    } catch (error) {
      if (error.code === 11000) continue;
      throw error;
    }
  }
  return { order_item_id: String(item._id), name: item.product_name || "Product", added: false,
    reason: "Your cart changed while adding this item. Please review your cart and try again." };
};

export const addBuyAgain = async (userId, orderId, selections) => {
  const items = await ownedItems(userId, orderId);
  const byId = new Map(items.map((item) => [String(item._id), item]));
  if (selections.some((selection) => !byId.has(selection.order_item_id))) {
    throw StatusError.badRequest("Selected items must belong to this order.");
  }
  const results = [];
  for (const selection of selections) {
    try {
      results.push(await addLine(userId, byId.get(selection.order_item_id), selection.quantity));
    } catch {
      // Preserve confirmed additions and report each failed item for review.
      results.push({ order_item_id: selection.order_item_id, added: false,
        reason: "Couldn't add this item. Review your cart before trying again." });
    }
  }
  return { results, currency: "INR" };
};
