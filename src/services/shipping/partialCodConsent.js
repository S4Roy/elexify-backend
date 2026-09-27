import crypto from "node:crypto";
import ShippingSettings from "../../models/ShippingSettings.js";
import Page from "../../models/Page.js";
import { StatusError } from "../../config/StatusErrors.js";

const policySlugs = ["terms-conditions", "refund-cancellations-policy", "privacy-policy"];
const wording = "I agree to the Partial COD payment terms and Refund & Cancellation Policy, and acknowledge the Privacy Policy.";

export async function getPartialCodTerms(settings, includeContent = false) {
  const pages = await Page.find({ slug: { $in: policySlugs }, status: "active", deleted_at: null })
    .select("slug title content short_description").lean();
  const policies = policySlugs.map(slug => {
    const page = pages.find(p => p.slug === slug);
    return { path: `/${slug}`, title: page?.title || slug, content: page?.content || "", short_description: page?.short_description || "" };
  });
  const available = policies.every(p => p.content.trim());
  const version = crypto.createHash("sha256").update(JSON.stringify({ wording, policies, advance_percent: settings.cod_advance_percent })).digest("hex");
  return {
    required: true, available: Boolean(available), version, wording,
    policies: includeContent ? policies : policies.map(({ path, title }) => ({ path, title })),
  };
}

export async function validatePartialCodConsent(acceptance, terms, { grandTotal, advanceAmount, currency, userId }) {
  if (!terms?.required) return null;
  if (!terms.available) throw StatusError.badRequest("PARTIAL_COD_CONSENT_UNAVAILABLE: Partial COD policies are unavailable. Choose online payment or contact support.");
  if (acceptance?.accepted !== true) throw StatusError.badRequest("PARTIAL_COD_CONSENT_REQUIRED: Please review and accept the Partial COD terms before placing your order.");
  if (acceptance.version !== terms.version || acceptance.grand_total !== grandTotal || acceptance.advance_amount !== advanceAmount) {
    throw StatusError.conflict("PARTIAL_COD_CONSENT_CHANGED: Payment terms changed. Review the updated terms and accept again.");
  }
  // Store the actual policy text so subsequent CMS edits cannot rewrite history.
  const settings = await ShippingSettings.getSingleton();
  const snapshot = await getPartialCodTerms(settings, true);
  if (snapshot.version !== terms.version) throw StatusError.conflict("PARTIAL_COD_CONSENT_CHANGED: Policies changed. Review and accept again.");
  return { ...snapshot, accepted: true, accepted_at: new Date(), customer_id: userId, grand_total: grandTotal, advance_amount: advanceAmount, currency };
}
