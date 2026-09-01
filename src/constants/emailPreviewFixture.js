import { emailBrand } from "../config/emailBrand.js";

// Safe, non-real sample data for the admin template preview/send-test-email
// features (sections 31/32 — "never use real customer order/contact data
// by default"). Covers every field any of the 21 seeded templates'
// required_variables can ask for.
export const EMAIL_PREVIEW_FIXTURE = {
  name: "Test Customer",
  order_id: "ORD-DEMO-1001",
  order_number: "ORD-DEMO-1001",
  order_date: "1 Jan 2026",
  payment_method_label: "Cash on Delivery",
  payment_status_label: "Paid",
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
  refund_amount: 1575,
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
  storefront_url: emailBrand.storefrontUrl,
  otp: "123456",
  purpose: "login",
  expiry: 10,
  reset_link: `${emailBrand.storefrontUrl}/reset-password?token=demo`,
  new_email: "demo.new@example.com",
};
