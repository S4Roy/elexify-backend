import nodemailer from "nodemailer";
import IntegrationCredential from "../../../models/IntegrationCredential.js";
import Token from "../../../models/Token.js";
import { StatusError, envs } from "../../../config/index.js";
import { auditService } from "../../../services/index.js";
import { decryptCredential, encryptCredential, maskCredential } from "../../../utils/integrationCredentialsCrypto.js";
import { getTokens as getShiprocketToken } from "../../../services/shiprocket/getTokens.js";
import { getPickupLocations as getShiprocketPickupLocations } from "../../../services/shiprocket/getPickupLocations.js";
import { getTokens as getZohoToken } from "../../../services/zoho/getTokens.js";
import { getRazorpayClient } from "../../../services/integrationCredentials/razorpay.js";
import { getIntegrationConfig } from "../../../services/integrationCredentials/index.js";

const PROVIDERS = {
  shiprocket: { label: "Shiprocket", fields: ["email", "password", "channel_id", "pickup_location"], secret: ["password"], plain: ["pickup_location"] },
  zoho: { label: "Zoho Books", fields: ["org_id", "client_id", "client_secret", "refresh_token", "base_url"], secret: ["client_secret", "refresh_token"] },
  google: { label: "Google Sign-In", fields: ["client_id"], secret: [] },
  razorpay: { label: "Razorpay", fields: ["key_id", "key_secret", "account_id", "webhook_secret"], secret: ["key_secret", "webhook_secret"] },
  smtp: { label: "Transactional Email (SMTP)", fields: ["host", "port", "secure", "email", "password", "fromEmail"], secret: ["password"], plain: ["host", "port", "secure", "email", "fromEmail"] },
};

const descriptor = async (provider) => {
  const definition = PROVIDERS[provider];
  const doc = await IntegrationCredential.findOne({ provider }).select("+credentials");
  const stored = doc?.credentials || new Map();
  const fields = Object.fromEntries(definition.fields.map((field) => {
    const configured = stored.has(field);
    const plainValue = configured ? decryptCredential(stored.get(field)) : null;
    // Non-secret operational fields (e.g. Shiprocket's pickup location
    // nickname) are shown in cleartext so the admin can pick/verify the
    // exact value instead of matching it against a masked placeholder.
    const exposePlain = definition.plain?.includes(field);
    return [field, {
      configured,
      masked: configured ? maskCredential(plainValue) : null,
      value: exposePlain ? plainValue : undefined,
      secret: definition.secret.includes(field),
    }];
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

const testShiprocket = async () => {
  await getShiprocketToken();
  const current = await IntegrationCredential.findOne({ provider: "shiprocket" }).select("+credentials");
  const configuredPickup = decryptCredential(current?.credentials?.get("pickup_location"));
  const locations = await getShiprocketPickupLocations().catch(() => null);
  if (!locations) {
    return "Connected, but couldn't fetch registered pickup locations to verify the configured one.";
  }
  if (!locations.length) {
    return "Connected, but no pickup locations are registered on this Shiprocket account yet. Add one in Shiprocket before shipping orders.";
  }
  if (!configuredPickup) {
    return `Connected. ${locations.length} pickup location(s) available — set "Pickup Location" to one of: ${locations.map((l) => l.pickup_location).join(", ")}.`;
  }
  const match = locations.find((l) => l.pickup_location?.toLowerCase() === configuredPickup.toLowerCase());
  if (!match) {
    return `Connected, but pickup location "${configuredPickup}" was not found on this Shiprocket account. Available: ${locations.map((l) => l.pickup_location).join(", ")}.`;
  }
  return `Connected. Pickup location "${match.pickup_location}" (${match.city}, ${match.pincode}) verified.`;
};

const testSmtp = async () => {
  const config = await getIntegrationConfig("smtp", envs.smtp);
  if (!config?.host || !config?.email || !config?.password) {
    throw new Error("Host, email, and password are required to test the SMTP connection.");
  }
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: Number(config.port) || 465,
    secure: String(config.secure) !== "false",
    auth: { user: config.email, pass: config.password },
  });
  await transporter.verify();
  return `Connected to ${config.host}:${config.port || 465} as ${config.email}.`;
};

export const test = async (req, res, next) => {
  const provider = String(req.params.provider || "").toLowerCase();
  try {
    const doc = await IntegrationCredential.findOne({ provider });
    if (!doc) throw StatusError.badRequest("Save managed credentials before testing.");
    if (!doc.enabled) throw StatusError.badRequest("Enable the integration before testing.");
    await Token.updateOne({ provider }, { $set: { access_token: null, expires_at: new Date(0) } });
    let message = "Connection verified";
    if (provider === "shiprocket") message = await testShiprocket();
    else if (provider === "zoho") await getZohoToken();
    else if (provider === "smtp") message = await testSmtp();
    else if (provider === "google") {
      const current = await IntegrationCredential.findOne({ provider }).select("+credentials");
      const clientId = decryptCredential(current?.credentials?.get("client_id"));
      if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) throw new Error("Google client ID format is invalid");
    } else if (provider === "razorpay") {
      const client = await getRazorpayClient();
      await client.orders.all({ count: 1 });
    } else throw StatusError.badRequest("Unsupported integration provider.");
    await IntegrationCredential.updateOne({ provider }, { $set: { last_tested_at: new Date(), last_test_status: "success", last_test_message: message } });
    await auditService.recordAudit({ userId: req.auth.user_id, actorId: req.auth.user_id, req, event: "INTEGRATION_CREDENTIAL_TESTED", metadata: { provider, status: "success" } });
    res.status(200).json({ status: "success", message });
  } catch (error) {
    const message = error?.message && typeof error.message === "string" ? error.message : "Connection test failed";
    await IntegrationCredential.updateOne({ provider }, { $set: { last_tested_at: new Date(), last_test_status: "failed", last_test_message: message } }).catch(() => {});
    await auditService.recordAudit({ userId: req.auth?.user_id, actorId: req.auth?.user_id, req, event: "INTEGRATION_CREDENTIAL_TESTED", metadata: { provider, status: "failed" } });
    next(error);
  }
};

export const pickupLocations = async (req, res, next) => {
  try {
    const doc = await IntegrationCredential.findOne({ provider: "shiprocket" });
    if (!doc) throw StatusError.badRequest("Save managed Shiprocket credentials before listing pickup locations.");
    if (!doc.enabled) throw StatusError.badRequest("Enable the Shiprocket integration before listing pickup locations.");
    const data = await getShiprocketPickupLocations();
    res.status(200).json({ status: "success", data });
  } catch (error) { next(error); }
};
