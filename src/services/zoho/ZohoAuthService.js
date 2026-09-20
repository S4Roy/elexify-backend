import { createHash, randomBytes } from "node:crypto";
import ZohoConnection from "../../models/ZohoConnection.js";
import ZohoOAuthState from "../../models/ZohoOAuthState.js";
import Token from "../../models/Token.js";
import { getIntegrationConfig } from "../integrationCredentials/index.js";
import { encryptCredential, decryptCredential } from "../../utils/integrationCredentialsCrypto.js";
import { acquireLease, releaseLease } from "./ZohoLease.js";
import { REGIONS, ZohoError } from "./ZohoBooksClient.js";

const digest = value => createHash("sha256").update(value).digest("hex");
const configuration = async () => {
  const credentials = await getIntegrationConfig("zoho", {
    client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET,
  });
  const redirect = process.env.ZOHO_REDIRECT_URI;
  if (!credentials?.client_id || !credentials?.client_secret || !redirect || new URL(redirect).protocol !== "https:") {
    throw new ZohoError("ZOHO_OAUTH_CONFIGURATION_REQUIRED");
  }
  return { ...credentials, redirect_uri: redirect };
};

const tokenRequest = async (region, body, endpoint = "token") => {
  if (!REGIONS[region]) throw new ZohoError("INVALID_ZOHO_REGION");
  let response;
  let payload;
  try {
    response = await fetch(`${REGIONS[region][0]}/oauth/v2/${endpoint}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    });
    payload = await response.json();
  } catch { throw new ZohoError("ZOHO_OAUTH_UNAVAILABLE", { retryable: true }); }
  if (!response.ok || payload.error) throw new ZohoError("ZOHO_OAUTH_REJECTED", { retryable: response.status === 429 || response.status >= 500 });
  return payload;
};

const tokenFields = (payload, region) => {
  if (!payload.access_token || !Number.isFinite(Number(payload.expires_in)) || !(Number(payload.expires_in) > 0) ||
      (payload.api_domain && payload.api_domain !== REGIONS[region][1])) throw new ZohoError("INVALID_ZOHO_TOKEN_RESPONSE");
  return { access_token: encryptCredential(payload.access_token), expires_at: new Date(Date.now() + Number(payload.expires_in) * 1000) };
};

export const beginAuthorization = async (actorId, region) => {
  if (!REGIONS[region]) throw new ZohoError("INVALID_ZOHO_REGION");
  const config = await configuration();
  const state = randomBytes(32).toString("hex");
  await ZohoOAuthState.create({ digest: digest(state), actor_id: actorId, region, expires_at: new Date(Date.now() + 600000) });
  const url = new URL(`${REGIONS[region][0]}/oauth/v2/auth`);
  url.search = new URLSearchParams({
    client_id: config.client_id, redirect_uri: config.redirect_uri, response_type: "code",
    access_type: "offline", prompt: "consent", state,
    scope: "ZohoBooks.settings.READ,ZohoBooks.contacts.CREATE,ZohoBooks.contacts.READ,ZohoBooks.contacts.UPDATE,ZohoBooks.settings.CREATE,ZohoBooks.settings.UPDATE,ZohoBooks.salesorders.CREATE,ZohoBooks.salesorders.READ,ZohoBooks.salesorders.UPDATE,ZohoBooks.invoices.CREATE,ZohoBooks.invoices.READ",
  }).toString();
  return url.toString();
};

export const completeAuthorization = async (actorId, state, code) => {
  const lease = await acquireLease("zoho-auth");
  if (!lease) throw new ZohoError("ZOHO_AUTH_BUSY", { retryable: true });
  try {
    const record = await ZohoOAuthState.findOneAndDelete({ digest: digest(state), actor_id: actorId, expires_at: { $gt: new Date() } });
    if (!record) throw new ZohoError("INVALID_OR_EXPIRED_OAUTH_STATE");
    const existing = await ZohoConnection.findOne({ key: "books" });
    if (existing?.connected) throw new ZohoError("DISCONNECT_BEFORE_RECONNECTING");
    if (existing?.revocation_pending) throw new ZohoError("COMPLETE_PENDING_TOKEN_REVOCATION");
    if (existing?.organization_id && existing.region !== record.region) throw new ZohoError("ZOHO_REGION_CHANGE_REQUIRES_MIGRATION");
    const config = await configuration();
    const payload = await tokenRequest(record.region, { grant_type: "authorization_code", code,
      client_id: config.client_id, client_secret: config.client_secret, redirect_uri: config.redirect_uri });
    if (!payload.refresh_token) throw new ZohoError("ZOHO_REFRESH_TOKEN_REQUIRED");
    await ZohoConnection.updateOne({ key: "books" }, {
      $set: { ...tokenFields(payload, record.region), region: record.region,
        refresh_token: encryptCredential(payload.refresh_token), connected: true, enabled: false },
      $inc: { generation: 1 },
    }, { upsert: true });
    await Token.updateOne({ provider: "zoho" }, { $set: { access_token: null, expires_at: new Date(0) },
      $unset: { client_id: "", client_secret: "", refresh_token: "" } });
  } finally { await releaseLease(lease); }
};

export const getAccessToken = async (expected, force = false) => {
  const current = await ZohoConnection.findOne({ key: "books", connected: true, generation: expected.generation }).select("+access_token +refresh_token");
  if (!current) throw new ZohoError("ZOHO_DISCONNECTED");
  if (!force && current.access_token && current.expires_at > new Date(Date.now() + 60000)) return decryptCredential(current.access_token);
  const lease = await acquireLease("zoho-auth");
  if (!lease) throw new ZohoError("ZOHO_REFRESH_BUSY", { retryable: true });
  try {
    const config = await configuration();
    const payload = await tokenRequest(current.region, { grant_type: "refresh_token",
      client_id: config.client_id, client_secret: config.client_secret, refresh_token: decryptCredential(current.refresh_token) });
    const result = await ZohoConnection.updateOne({ _id: current._id, generation: expected.generation, connected: true }, { $set: tokenFields(payload, current.region) });
    if (result.matchedCount !== 1) throw new ZohoError("ZOHO_CONNECTION_CHANGED");
    return payload.access_token;
  } finally { await releaseLease(lease); }
};

export const disconnect = async () => {
  const lease = await acquireLease("zoho-auth");
  if (!lease) throw new ZohoError("ZOHO_AUTH_BUSY", { retryable: true });
  try {
    const current = await ZohoConnection.findOne({ key: "books" }).select("+refresh_token +revocation_token");
    const token = current?.refresh_token || current?.revocation_token;
    await ZohoConnection.updateOne({ key: "books" }, {
      $set: { connected: false, enabled: false }, $inc: { generation: 1 },
      $unset: { access_token: "", expires_at: "" },
    });
    if (token) {
      await ZohoConnection.updateOne({ key: "books" }, { $set: { revocation_token: token, revocation_pending: true }, $unset: { refresh_token: "" } });
      await tokenRequest(current.region, { token: decryptCredential(token) }, "token/revoke");
      await ZohoConnection.updateOne({ key: "books" }, { $set: { revocation_pending: false }, $unset: { revocation_token: "" } });
    }
  } finally { await releaseLease(lease); }
};
