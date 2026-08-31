import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { assertSafeE2EDatabase } from "./e2eDatabaseGuard.js";
import Address from "../models/Address.js";
import Cart from "../models/Cart.js";
import Coupon from "../models/Coupon.js";
import ExchangeRate from "../models/ExchangeRate.js";
import Pincode from "../models/Pincode.js";
import Product from "../models/Product.js";
import ShippingRate from "../models/ShippingRate.js";
import ShippingSettings from "../models/ShippingSettings.js";
import ShippingZone from "../models/ShippingZone.js";
import SiteSetting from "../models/SiteSetting.js";
import User from "../models/User.js";
import EmailTemplate from "../models/EmailTemplate.js";

const uri = process.env.E2E_MONGODB_URI || "mongodb://127.0.0.1:27129/elexify_e2e?replicaSet=elexifyE2ERs";
assertSafeE2EDatabase(uri);
await mongoose.connect(uri);
await mongoose.connection.db.dropDatabase();

// On a replica set, dropDatabase is a two-phase, majority-committed
// operation — collections are staged into a pending-drop state before
// they're actually removed. A reseed that fires immediately after a prior
// test's teardown can land while that drop is still pending and get
// "DatabaseDropPending" (code 215) on the very next write. Confirm the
// drop has actually settled before seeding, instead of racing it.
// Note: the probe collection is deliberately left behind rather than
// dropped here — issuing a second drop would itself re-enter the same
// pending-drop state and race the very next seed write. It's removed for
// free by the next reseed's own dropDatabase() call.
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    await mongoose.connection.db.createCollection("__seed_probe__");
    break;
  } catch (error) {
    if (error?.code !== 215 || attempt === 19) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const password = process.env.E2E_CUSTOMER_PASSWORD || "ElexifyE2E!2026";
const passwordHash = await bcrypt.hash(password, 10);
const [customer, competitor] = await User.create([
  { role: "customer", name: "E2E Customer", email: "e2e.customer@example.com", password: passwordHash, status: "active", email_verified_at: new Date() },
  { role: "customer", name: "E2E Competitor", email: "e2e.competitor@example.com", password: passwordHash, status: "active", email_verified_at: new Date() },
]);
const [customerAddress, competitorAddress] = await Address.create([
  { user: customer._id, full_name: "E2E Customer", phone: "9876543210", address_line_1: "1 E2E Street", city_name: "Kolkata", state: 19, state_name: "West Bengal", country: 101, country_name: "India", postcode: "700001", purpose: "both", is_default: true },
  { user: competitor._id, full_name: "E2E Competitor", phone: "9876543211", address_line_1: "2 E2E Street", city_name: "Kolkata", state: 19, state_name: "West Bengal", country: 101, country_name: "India", postcode: "700001", purpose: "both", is_default: true },
]);
const products = await Product.create([
  { name: "E2E Normal Product", slug: "e2e-normal-product", sku: "E2E-NORMAL", regular_price: 1000, stock_quantity: 20, weight: 1, status: "active", cod_status: "allowed" },
  { name: "E2E Final Stock Product", slug: "e2e-final-stock-product", sku: "E2E-FINAL", regular_price: 700, stock_quantity: 1, weight: 1, status: "active", cod_status: "allowed" },
  { name: "E2E Sale Product", slug: "e2e-sale-product", sku: "E2E-SALE", regular_price: 1200, sale_price: 900, stock_quantity: 10, weight: 1, status: "active", cod_status: "allowed" },
  { name: "E2E Buy Now Product", slug: "e2e-buy-now-product", sku: "E2E-BUY-NOW", regular_price: 1500, stock_quantity: 10, weight: 1, status: "active", cod_status: "allowed" },
  { name: "E2E Cart Product C", slug: "e2e-cart-product-c", sku: "E2E-CART-C", regular_price: 500, stock_quantity: 10, weight: 1, status: "active", cod_status: "allowed" },
]);
await Cart.create([
  { user: customer._id, product: products[0]._id, quantity: 1, price: 1000 },
  { user: customer._id, product: products[4]._id, quantity: 1, price: 500 },
  { user: competitor._id, product: products[1]._id, quantity: 1, price: 700 },
]);
await Coupon.create({
  code: "E2E10", title: "E2E 10%", discount_type: "percentage", discount_value: 10,
  applicable_for: "user", applicable_scope: "all", usage_limit: 100, usage_per_email: 10,
  start_date: new Date(Date.now() - 86_400_000), end_date: new Date(Date.now() + 7 * 86_400_000), status: "active",
});
await Pincode.create({ pincode: "700001", status: "active", cod_status: "allowed", state_id: 19, country_id: 101 });
const zone = await ShippingZone.create({ name: "E2E Kolkata", countries: [101], states: [19], pincode_prefixes: ["700"], status: "active" });
await ShippingRate.create({ zone: zone._id, flat_rate: 50, per_kg_rate: 0, min_delivery_days: 2, max_delivery_days: 4, status: "active" });
await ShippingSettings.create({ cod_enabled: true, cod_min_order: 0, cod_max_order: 100000, cod_charge_enabled: true, cod_charge: 25, default_shipping_zone: zone._id });
await ExchangeRate.create({ base: "INR", rates: { INR: 1 }, updated_at: new Date() });
await SiteSetting.create([
  { slug: "company_name", value: "Elexify E2E", label: "Company name", type: "text" },
  { slug: "company_address", value: "Kolkata, West Bengal", label: "Company address", type: "text" },
  { slug: "company_state", value: "West Bengal", label: "Company state", type: "text" },
  { slug: "company_gstin", value: "19ABCDE1234F1Z5", label: "GSTIN", type: "text" },
  { slug: "company_gst_rate", value: "18", label: "GST rate", type: "number" },
]);

// Without this, OTP-dependent E2E specs (login-by-OTP, email/mobile change)
// hit the same "zero EmailTemplate rows" bootstrap gap Phase 2 fixed for
// every other environment — see src/scripts/seedEmailTemplates.js.
await EmailTemplate.create([
  { action: "otp", site_language: "en", subject: "Your OTP Code", body: "<p>{{name}}, your OTP is {{otp}}</p>", status: "active" },
  { action: "email_changed", site_language: "en", subject: "Your account email was changed", body: "<p>{{name}}, your email was changed.</p>", status: "active" },
]);

console.log(JSON.stringify({
  database: mongoose.connection.name,
  customer: { id: String(customer._id), email: customer.email, address_id: String(customerAddress._id) },
  competitor: { id: String(competitor._id), email: competitor.email, address_id: String(competitorAddress._id) },
  products: Object.fromEntries(products.map((product) => [product.slug, String(product._id)])),
  coupon: "E2E10",
}, null, 2));
await mongoose.disconnect();
