import { envs } from "./envs.js";

// Canonical brand/identity config consumed by the email layout + footer.
// Deliberately env-sourced (synchronous, no extra DB round trip per send)
// rather than pulling from the separate SiteSetting-based company config
// used by the invoice service (src/services/invoiceService/getCompanySettings.js)
// — that config is async and invoice-specific; merging the two is out of
// scope for this pass (see the final report's "remaining issues").
const frontendUrl = (envs.FRONTEND_URL || "").replace(/\/$/, "");
const backendUrl = (envs.BACKEND_URL || "").replace(/\/$/, "");

export const emailBrand = {
  brandName: envs.PROJECT_NAME || "Elexify",
  logoUrl: process.env.EMAIL_BRAND_LOGO_URL || `${backendUrl}/public/images/logo/logo.png`,
  storefrontUrl: frontendUrl,
  supportEmail: envs.smtp.fromEmail || "support@example.com",
  supportPhone: process.env.EMAIL_BRAND_SUPPORT_PHONE || "",
  companyAddress: process.env.EMAIL_BRAND_COMPANY_ADDRESS || "",
  privacyUrl: `${frontendUrl}/page/privacy-policy`,
  termsUrl: `${frontendUrl}/page/terms-and-conditions`,
  accountUrl: `${frontendUrl}/account`,
  ordersUrl: `${frontendUrl}/account/orders`,
  preferencesUrl: `${frontendUrl}/account/notifications`,
};
