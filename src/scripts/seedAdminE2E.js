import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { assertSafeE2EDatabase } from "./e2eDatabaseGuard.js";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import Coupon from "../models/Coupon.js";
import Order from "../models/Order.js";
import OrderItem from "../models/OrderItem.js";
import Page from "../models/Page.js";
import Product from "../models/Product.js";
import User from "../models/User.js";

const uri = process.env.E2E_MONGODB_URI || "mongodb://127.0.0.1:27139/elexify_e2e_admin?replicaSet=elexifyAdminE2ERs";
assertSafeE2EDatabase(uri);
await mongoose.connect(uri);
await mongoose.connection.db.dropDatabase();

// Same DatabaseDropPending race as seedE2E.js - see that file for the full
// explanation. Confirm the drop has settled before seeding.
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    await mongoose.connection.db.createCollection("__seed_probe__");
    break;
  } catch (error) {
    if (error?.code !== 215 || attempt === 19) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const adminPassword = process.env.E2E_ADMIN_PASSWORD || "ElexifyAdminE2E!2026";
const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
const admin = await User.create({
  role: "superadmin",
  name: "E2E Admin",
  email: "e2e.admin@example.com",
  password: adminPasswordHash,
  status: "active",
  email_verified_at: new Date(),
});

const category = await Category.create({
  name: "E2E Category",
  slug: "e2e-category",
  description: "Seeded for admin E2E smoke tests",
});

const brand = await Brand.create({
  name: "E2E Brand",
  slug: "e2e-brand",
  description: "Seeded for admin E2E smoke tests",
});

const products = await Product.create([
  {
    name: "E2E Admin Product",
    slug: "e2e-admin-product",
    sku: "E2E-ADMIN-1",
    regular_price: 1500,
    stock_quantity: 25,
    weight: 1,
    status: "active",
    cod_status: "allowed",
    brand: brand._id,
    categories: [category._id],
  },
  {
    name: "E2E Admin Second Product",
    slug: "e2e-admin-second-product",
    sku: "E2E-ADMIN-2",
    regular_price: 800,
    stock_quantity: 12,
    weight: 1,
    status: "active",
    cod_status: "allowed",
    brand: brand._id,
    categories: [category._id],
  },
]);

await Coupon.create({
  code: "E2EADMIN10",
  title: "E2E Admin 10%",
  discount_type: "percentage",
  discount_value: 10,
  applicable_for: "user",
  applicable_scope: "all",
  usage_limit: 100,
  usage_per_email: 10,
  start_date: new Date(Date.now() - 86_400_000),
  end_date: new Date(Date.now() + 7 * 86_400_000),
  status: "active",
});

await Page.create({
  title: "E2E Admin Static Page",
  slug: "e2e-admin-static-page",
  content: "<p>Seeded content for the admin CMS/CKEditor smoke test.</p>",
  short_description: "Seeded for admin E2E smoke tests",
});

// A plain guest/admin-placed order, not routed through the real checkout
// pipeline (that pipeline is already covered end-to-end by the backend's own
// integration suite and the storefront's Playwright suite - this seed only
// needs a realistic, schema-valid Order + OrderItem pair for the admin
// order-list/detail/status-change smoke tests to have something to look at).
const order = await Order.create({
  id: `E2E-ORD-${Date.now()}`,
  order_status: "confirmed",
  payment_status: "paid",
  payment_method: "cod",
  total_amount: 1500,
  total_items: 1,
  grand_total: 1500 + 25,
  shipping: 25,
});
await OrderItem.create({
  order_id: order._id,
  product_id: products[0]._id,
  quantity: 1,
  unit_price: 1500,
  total_price: 1500,
  product_name: products[0].name,
  sku: products[0].sku,
});

console.log(JSON.stringify({
  database: mongoose.connection.name,
  admin: { email: admin.email },
  category: category.slug,
  brand: brand.slug,
  products: Object.fromEntries(products.map((p) => [p.slug, String(p._id)])),
  coupon: "E2EADMIN10",
  page: "e2e-admin-static-page",
  order: order.id,
}, null, 2));
await mongoose.disconnect();
