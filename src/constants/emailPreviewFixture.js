import { emailBrand } from "../config/emailBrand.js";

// Safe, non-real sample data for the admin template preview/send-test-email
// features (sections 31/32 — "never use real customer order/contact data
// by default"). Covers every field any of the 21 seeded templates'
// required_variables can ask for.
export const EMAIL_PREVIEW_FIXTURE = {
  name: "Test Customer",
  order_id: "ORD-DEMO-1001",
  order_number: "ORD-DEMO-1001",
  return_request_number: "RET-DEMO-1001",
  return_status: "Inspection in progress",
  order_date: "1 Jan 2026",
  payment_method_label: "Cash on Delivery",
  payment_status_label: "Pending",
  order_status_label: "Confirmed",
  is_cod: true,
  items: [
    { product_name: "Sample Product", variation_name: "Blue / Medium", quantity: 1, unit_price: 1575, total_price: 1575 },
  ],
  subtotal: 1575,
  discount: 0,
  coupon_code: null,
  shipping: 0,
  grand_total: 1575,
  refund_amount: 0,
  shipping_address: {
    name: "Test Customer",
    line1: "123 Demo Street",
    line2: null,
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700001",
    country: "India",
  },
  courier_name: "Demo Courier",
  tracking_number: "DEMO-TRACK-1",
  view_order_url: `${emailBrand.ordersUrl}/ORD-DEMO-1001`,
  account_url: emailBrand.accountUrl,
  lockout_minutes: 5,
  storefront_url: emailBrand.storefrontUrl,
  cart_url: `${emailBrand.storefrontUrl}/cart`,
  product_name: "Sample Product",
  product_url: `${emailBrand.storefrontUrl}/products/sample-product`,
  image_url: null,
  price: 1575,
  threshold: 5,
  out_count: 1,
  low_count: 1,
  stock_items: [
    { product_name: "Sample Product", variation_name: "Blue / Medium", sku: "SKU-1", stock_quantity: 0, level_label: "Out of stock", waiting: 3 },
    { product_name: "Another Product", variation_name: null, sku: null, stock_quantity: 2, level_label: "Low stock", waiting: 0 },
  ],
  admin_url: null,
  cart_total: 1575,
  item_count: 1,
  more_items_count: 0,
  otp: "123456",
  purpose: "login",
  expiry: 10,
  reset_link: `${emailBrand.storefrontUrl}/reset-password?token=demo`,
  new_email: "demo.new@example.com",
};

// Preview and test sends use the same event-specific demonstration state.
export function emailPreviewFixture(action) {
  const data = { ...EMAIL_PREVIEW_FIXTURE };
  const states = { order_shipped: 'Shipped', order_delivered: 'Delivered', order_cancelled: 'Cancelled', order_processing: 'Processing', order_out_for_delivery: 'Out for delivery', order_ready_for_pickup: 'Ready for pickup', refund_initiated: 'Refund initiated', refund_completed: 'Refunded' };
  data.order_status_label = states[action] || 'Confirmed';
  if (action === 'payment_success') { data.is_cod = false; data.payment_method_label = 'Online payment'; data.payment_status_label = 'Paid'; }
  if (action === 'payment_failed') { data.is_cod = false; data.payment_method_label = 'Online payment'; data.payment_status_label = 'Failed'; }
  if (action === 'order_delivered') data.payment_status_label = 'Paid';
  if (['refund_initiated', 'refund_completed'].includes(action)) {
    data.is_cod = false;
    data.payment_method_label = 'Online payment';
    data.payment_status_label = action === 'refund_completed' ? 'Refunded' : 'Paid';
    data.refund_amount = data.grand_total;
  }
  return data;
}
