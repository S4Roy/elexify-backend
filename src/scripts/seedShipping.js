/**
 * Seeds a minimal default shipping configuration so checkout works out of
 * the box before an admin has configured anything: one "Standard" shipping
 * class, one all-India default zone, and one flat-rate default rate. Safe
 * to re-run — it's a no-op once a default zone already exists.
 *
 * Usage:
 *   node src/scripts/seedShipping.js
 */
import mongoose from "../config/mongoose.js";
import ShippingClass from "../models/ShippingClass.js";
import ShippingZone from "../models/ShippingZone.js";
import ShippingRate from "../models/ShippingRate.js";

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  const existingDefaultZone = await ShippingZone.findOne({ is_default: true });
  if (existingDefaultZone) {
    console.log("A default shipping zone already exists — nothing to seed.");
    process.exit(0);
  }

  let standardClass = await ShippingClass.findOne({ slug: "standard" });
  if (!standardClass) {
    standardClass = await ShippingClass.create({
      name: "Standard",
      slug: "standard",
      description: "Default shipping class for regular products",
      is_default: true,
      status: "active",
    });
    console.log("Created default Shipping Class: Standard");
  }

  const zone = await ShippingZone.create({
    name: "All India",
    countries: [101],
    states: [],
    pincode_prefixes: [],
    is_default: true,
    status: "active",
  });
  console.log("Created default Shipping Zone: All India");

  await ShippingRate.create({
    zone: zone._id,
    shipping_class: null,
    flat_rate: 50,
    per_kg_rate: 20,
    free_weight_kg: 0.5,
    free_shipping_min_order_value: 999,
    min_delivery_days: 3,
    max_delivery_days: 6,
    status: "active",
  });
  console.log("Created default Shipping Rate for All India zone.");

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
