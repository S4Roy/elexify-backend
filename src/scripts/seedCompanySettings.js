/**
 * Seeds the company/GST settings used to populate the header of generated
 * tax invoices (src/services/invoiceService). Idempotent — upserts by
 * slug, and only sets a starting value if the setting doesn't already
 * exist, so re-running this never clobbers values an admin has since
 * edited via the Settings page. GSTIN and the GST rate are left blank on
 * first seed (no fabricated tax registration data) — GST columns stay
 * hidden on invoices until an admin fills them in.
 *
 * Usage:
 *   node src/scripts/seedCompanySettings.js
 */
import mongoose from "../config/mongoose.js";
import SiteSetting from "../models/SiteSetting.js";

const settings = [
  {
    slug: "company_name",
    label: "Company Name",
    type: "company_info",
    value: "Elexify Online",
  },
  {
    slug: "company_address",
    label: "Company Address",
    type: "company_info",
    value:
      "57, T.N. Banerjee Road, Panihati, Kolkata - 700114, West Bengal, India",
  },
  {
    slug: "company_state",
    label: "Company State (for GST intra/inter-state split)",
    type: "company_info",
    value: "West Bengal",
  },
  {
    slug: "company_gstin",
    label: "Company GSTIN",
    type: "company_info",
    value: "",
  },
  {
    slug: "company_email",
    label: "Company Email",
    type: "company_info",
    value: "support@elexify.online",
  },
  {
    slug: "company_phone",
    label: "Company Phone",
    type: "company_info",
    value: "+91 9110976419",
  },
  {
    slug: "company_gst_rate",
    label: "GST Rate % (0 hides GST on invoices)",
    type: "company_info",
    value: "0",
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
      { $setOnInsert: { ...setting, updated_at: new Date() } },
      { upsert: true },
    );
    // Mongoose 5's updateOne() result uses the legacy driver shape
    // ({upserted: [...]}), not v6+'s {upsertedCount} — check both so this
    // logs correctly regardless of mongoose version.
    const wasCreated = result.upsertedCount || result.upserted?.length;
    console.log(
      wasCreated
        ? `Created setting: ${setting.slug}`
        : `Already exists, left untouched: ${setting.slug}`,
    );
  }

  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
