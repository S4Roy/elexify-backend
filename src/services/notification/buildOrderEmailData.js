import moment from "moment";
import OrderItem from "../../models/OrderItem.js";
import Address from "../../models/Address.js";
import { snapshotAddress } from "../invoiceService/snapshotAddress.js";
import { emailBrand } from "../../config/emailBrand.js";

const PAYMENT_METHOD_LABELS = {
  cod: "Cash on Delivery",
  razorpay: "Online Payment",
  paypal: "Online Payment (PayPal)",
};

const humanize = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const toAddressBlock = (snapshot) => {
  if (!snapshot) return null;
  return {
    name: snapshot.full_name || null,
    line1: snapshot.address_line_1 || null,
    line2: snapshot.address_line_2 || null,
    city: snapshot.city || null,
    state: snapshot.state || null,
    pincode: snapshot.postcode || null,
    country: snapshot.country || null,
  };
};

/**
 * Builds the canonical order-summary data contract every order/payment/
 * refund email template renders (`{{> orderSummaryCard}}` /
 * `{{> addressBlock}}` / CTA URL) — real historical snapshot data
 * (OrderItem's own point-in-time fields, and the address snapshot
 * captured at placement), never a live product-price refetch. Safe to
 * call at any of the notification call sites where `order` is already
 * loaded; adds one indexed `OrderItem.find({order_id})` query.
 */
export const buildOrderEmailData = async (order) => {
  const items = await OrderItem.find({ order_id: order._id })
    .select("product_name variation_name quantity unit_price total_price")
    .lean();

  let shippingAddressSnapshot = order.shipping_address_snapshot;
  if (!shippingAddressSnapshot && order.shipping_address) {
    const address = await Address.findById(order.shipping_address).lean();
    shippingAddressSnapshot = snapshotAddress(address);
  }

  return {
    order_id: order.id,
    order_number: order.id,
    order_date: moment(order.created_at).format("D MMM YYYY"),
    payment_method_label: PAYMENT_METHOD_LABELS[order.payment_method] || humanize(order.payment_method),
    payment_status_label: humanize(order.payment_status),
    order_status_label: humanize(order.order_status),
    is_cod: order.payment_method === "cod",
    items: items.map((item) => ({
      product_name: item.product_name,
      variation_name: item.variation_name || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
    })),
    subtotal: order.total_amount,
    discount: order.discount || 0,
    coupon_code: order.coupon_code || null,
    shipping: order.shipping || 0,
    grand_total: order.grand_total,
    shipping_address: toAddressBlock(shippingAddressSnapshot),
    courier_name: order.courier_name || null,
    tracking_number: order.awb || null,
    view_order_url: `${emailBrand.ordersUrl}/${order.id}`,
  };
};
