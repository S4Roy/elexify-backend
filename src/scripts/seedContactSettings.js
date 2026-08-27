/**
 * Fixes the contact_mobile / contact_email / contact_address site settings
 * (they held unrelated placeholder values left over from testing) and adds
 * business_hours, so the Contact Us page shows Elexify's real contact
 * details. Idempotent — upserts by slug. Safe to re-run.
 *
 * Usage:
 *   node src/scripts/seedContactSettings.js
 */
import mongoose from "../config/mongoose.js";
import SiteSetting from "../models/SiteSetting.js";

const settings = [
  {
    slug: "contact_mobile",
    label: "Contact Mobile",
    type: "text",
    value: "+91 9110976419",
  },
  {
    slug: "contact_email",
    label: "Contact Email",
    type: "text",
    value: "support@elexify.online",
  },
  {
    slug: "contact_address",
    label: "Contact Address",
    type: "text",
    value: "57, T.N. Banerjee Road, Panihati, Kolkata - 700114, West Bengal, India",
  },
  {
    slug: "business_hours",
    label: "Business Hours",
    type: "text",
    value: "Call us: 10 AM - 6 PM",
  },
];

const run = async () => {
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once("open", resolve);
      mongoose.connection.once("error", reject);
    });
  }

  for (const setting of settings) {
    const result = await SiteSetting.updateOne(
      { slug: setting.slug },
      { $set: { ...setting, updated_at: new Date() } },
      { upsert: true },
    );
    console.log(
      `${result.upsertedCount ? "Created" : "Updated"} setting: ${setting.slug} = ${setting.value}`,
    );
  }

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
