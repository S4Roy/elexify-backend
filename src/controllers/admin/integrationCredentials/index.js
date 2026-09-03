import IntegrationCredential from "../../../models/IntegrationCredential.js";
import Token from "../../../models/Token.js";
import { StatusError } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";
import { decryptCredential, encryptCredential, maskCredential } from "../../../utils/integrationCredentialsCrypto.js";
import { getTokens as getShiprocketToken } from "../../../services/shiprocket/getTokens.js";
import { getTokens as getZohoToken } from "../../../services/zoho/getTokens.js";
import { getPayPalToken } from "../../../services/paymentService/getPayPalToken.js";
import { getRazorpayClient } from "../../../services/integrationCredentials/razorpay.js";

const PROVIDERS = {
  paypal: { label: "PayPal", fields: ["client_id", "client_secret", "environment"], secret: ["client_secret"], defaults: { environment: "sandbox" } },
  shiprocket: { label: "Shiprocket", fields: ["email", "password", "channel_id"], secret: ["password"] },
  zoho: { label: "Zoho Books", fields: ["org_id", "client_id", "client_secret", "refresh_token", "base_url"], secret: ["client_secret", "refresh_token"] },
  google: { label: "Google Sign-In", fields: ["client_id"], secret: [] },
  razorpay: { label: "Razorpay", fields: ["key_id", "key_secret", "account_id", "webhook_secret"], secret: ["key_secret", "webhook_secret"] },
};

const descriptor = async (provider) => {
  const definition = PROVIDERS[provider];
  const doc = await IntegrationCredential.findOne({ provider }).select("+credentials");
  const stored = doc?.credentials || new Map();
  const fields = Object.fromEntries(definition.fields.map((field) => {
    const configured = stored.has(field);
    const plain = configured ? decryptCredential(stored.get(field)) : null;
    return [field, { configured, masked: configured ? maskCredential(plain) : null, secret: definition.secret.includes(field) }];
  }));
  return {
    provider, label: definition.label, enabled: doc?.enabled ?? true,
    configured: definition.fields.some((field) => stored.has(field)), fields,
    last_tested_at: doc?.last_tested_at ?? null,
    last_test_status: doc?.last_test_status ?? null,
    last_test_message: doc?.last_test_message ?? null,
    updated_at: doc?.updated_at ?? null,
  };
};

export const list = async (req, res, next) => {
  try {
    const data = await Promise.all(Object.keys(PROVIDERS).map(descriptor));
    res.status(200).json({ status: "success", data });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const provider = String(req.params.provider || "").toLowerCase();
    const definition = PROVIDERS[provider];
    if (!definition) throw StatusError.badRequest("Unsupported integration provider.");
    const supplied = req.body?.credentials || {};
    const unknown = Object.keys(supplied).filter((key) => !definition.fields.includes(key));
    if (unknown.length) throw StatusError.badRequest(`Unsupported credential field: ${unknown[0]}`);

    let doc = await IntegrationCredential.findOne({ provider }).select("+credentials");
    if (!doc) doc = new IntegrationCredential({ provider, created_by: req.auth.user_id });
    for (const [key, value] of Object.entries(supplied)) {
      if (value === "" || value == null) continue; // blank means preserve the write-only value
      doc.credentials.set(key, encryptCredential(String(value).trim()));
    }
    if (typeof req.body.enabled === "boolean") doc.enabled = req.body.enabled;
    doc.updated_by = req.auth.user_id;
    doc.last_test_status = null;
    doc.last_test_message = null;
    await doc.save();
    // Force OAuth providers to obtain a fresh access token with the rotated credentials.
    await Token.updateOne(
      { provider },
      {
        $set: { access_token: null, expires_at: new Date(0) },
        // Older Zoho cache documents stored long-lived secrets directly.
        // They are no longer consumed and are scrubbed during rotation.
        $unset: { client_id: "", client_secret: "", refresh_token: "" },
      },
    );
    await auditService.recordAudit({
      userId: req.auth.user_id, actorId: req.auth.user_id, req,
      event: "INTEGRATION_CREDENTIAL_UPDATED",
      metadata: { provider, fields_changed: Object.keys(supplied), enabled: doc.enabled },
    });
    res.status(200).json({ status: "success", message: "Integration credentials updated.", data: await descriptor(provider) });
  } catch (error) { next(error); }
};

export const clear = async (req, res, next) => {
  try {
    const provider = String(req.params.provider || "").toLowerCase();
    if (!PROVIDERS[provider]) throw StatusError.badRequest("Unsupported integration provider.");
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 10) throw StatusError.badRequest("A reason of at least 10 characters is required.");
    await IntegrationCredential.deleteOne({ provider });
    await Token.updateOne(
      { provider },
      { $set: { access_token: null, expires_at: new Date(0) }, $unset: { client_id: "", client_secret: "", refresh_token: "" } },
    );
    await auditService.recordAudit({ userId: req.auth.user_id, actorId: req.auth.user_id, req, reason, event: "INTEGRATION_CREDENTIAL_CLEARED", metadata: { provider } });
    res.status(200).json({ status: "success", message: "Managed credentials removed; environment fallback remains available." });
  } catch (error) { next(error); }
};

export const test = async (req, res, next) => {
  const provider = String(req.params.provider || "").toLowerCase();
  try {
    const doc = await IntegrationCredential.findOne({ provider });
    if (!doc) throw StatusError.badRequest("Save managed credentials before testing.");
    if (!doc.enabled) throw StatusError.badRequest("Enable the integration before testing.");
    await Token.updateOne({ provider }, { $set: { access_token: null, expires_at: new Date(0) } });
    if (provider === "paypal") await getPayPalToken();
    else if (provider === "shiprocket") await getShiprocketToken();
    else if (provider === "zoho") await getZohoToken();
    else if (provider === "google") {
      const current = await IntegrationCredential.findOne({ provider }).select("+credentials");
      const clientId = decryptCredential(current?.credentials?.get("client_id"));
      if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) throw new Error("Google client ID format is invalid");
    } else if (provider === "razorpay") {
      const client = await getRazorpayClient();
      await client.orders.all({ count: 1 });
    } else throw StatusError.badRequest("Unsupported integration provider.");
    await IntegrationCredential.updateOne({ provider }, { $set: { last_tested_at: new Date(), last_test_status: "success", last_test_message: "Connection verified" } });
    await auditService.recordAudit({ userId: req.auth.user_id, actorId: req.auth.user_id, req, event: "INTEGRATION_CREDENTIAL_TESTED", metadata: { provider, status: "success" } });
    res.status(200).json({ status: "success", message: "Connection verified successfully." });
  } catch (error) {
    await IntegrationCredential.updateOne({ provider }, { $set: { last_tested_at: new Date(), last_test_status: "failed", last_test_message: "Connection test failed" } }).catch(() => {});
    await auditService.recordAudit({ userId: req.auth?.user_id, actorId: req.auth?.user_id, req, event: "INTEGRATION_CREDENTIAL_TESTED", metadata: { provider, status: "failed" } });
    next(error);
  }
};
