import SiteSetting from "../../models/SiteSetting.js";

// Slugs seeded by src/scripts/seedCompanySettings.js — editable by admins
// via the existing generic Settings page (SiteSetting list/edit), the same
// mechanism already used for contact_email/contact_address/etc. Reading
// these fresh (rather than from env vars) means an admin can update the
// registered GSTIN/address without a redeploy.
const SLUGS = {
  name: "company_name",
  address: "company_address",
  state: "company_state",
  gstin: "company_gstin",
  email: "company_email",
  phone: "company_phone",
  gstRate: "company_gst_rate",
};

// GST columns are hidden entirely on the invoice unless both a GSTIN and a
// non-zero rate are configured here — there is no per-product HSN/tax
// capture anywhere in the order pipeline today.
export const getCompanySettings = async () => {
  const docs = await SiteSetting.find({ slug: { $in: Object.values(SLUGS) } }).lean();
  const bySlug = new Map(docs.map((d) => [d.slug, d.value]));

  return {
    name: bySlug.get(SLUGS.name) || "Elexify Online",
    address: bySlug.get(SLUGS.address) || "",
    state: bySlug.get(SLUGS.state) || "",
    gstin: bySlug.get(SLUGS.gstin) || "",
    email: bySlug.get(SLUGS.email) || "",
    phone: bySlug.get(SLUGS.phone) || "",
    gstRate: Number(bySlug.get(SLUGS.gstRate)) || 0,
  };
};
