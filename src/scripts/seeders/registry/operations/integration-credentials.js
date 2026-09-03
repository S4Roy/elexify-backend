import IntegrationCredential from "../../../../models/IntegrationCredential.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";
import { assertCredentialEncryptionConfigured, encryptCredential } from "../../../../utils/integrationCredentialsCrypto.js";
import { envs } from "../../../../config/index.js";

// Only providers already wired to consume managed configuration belong here.
// Values are read exclusively through config/envs.js. That module owns the
// process.env mapping/defaults; data operations never reach into process.env
// directly. Never log or return any value from this map.
const CONFIG_FIELDS = {
  paypal: {
    section: "paypal",
    fields: { client_id: "client_id", client_secret: "secret", environment: "env" },
    identityFields: ["client_id", "client_secret"],
  },
  shiprocket: {
    section: "shiprocket",
    fields: { email: "email", password: "password", channel_id: "channel_id" },
    identityFields: ["email", "password"],
  },
  zoho: {
    section: "zoho",
    fields: { org_id: "ORG_ID", client_id: "CLIENT_ID", client_secret: "CLIENT_SECRET", refresh_token: "REFRESH_TOKEN", base_url: "BASE_URL" },
    identityFields: ["org_id", "client_id", "client_secret", "refresh_token"],
  },
  google: {
    section: "google",
    fields: { client_id: "clientId" },
    identityFields: ["client_id"],
  },
  razorpay: {
    section: "razorpay",
    fields: { key_id: "key_id", key_secret: "key_secret", account_id: "account_id", webhook_secret: "webhook_secret" },
    identityFields: ["key_id", "key_secret"],
  },
};

const configuredEnvironment = (configuration = envs) =>
  Object.entries(CONFIG_FIELDS).flatMap(([provider, definition]) => {
    const section = configuration[definition.section] || {};
    const credentials = Object.entries(definition.fields)
      .map(([field, property]) => [field, String(section[property] || "").trim()])
      .filter(([, value]) => Boolean(value));
    // Ignore default-only values such as PayPal "sandbox" or Zoho's base
    // URL unless that provider also has an actual identity/secret value.
    const configured = credentials.some(([field]) => definition.identityFields.includes(field));
    return configured ? [{ provider, credentials }] : [];
  });

const planImport = async (configuration = envs) => {
  const sources = configuredEnvironment(configuration);
  const existing = await IntegrationCredential.find({
    provider: { $in: sources.map(({ provider }) => provider) },
  }).select("provider +credentials");
  const byProvider = new Map(existing.map((doc) => [doc.provider, doc]));

  return sources.map(({ provider, credentials }) => {
    const doc = byProvider.get(provider);
    const missing = credentials.filter(([field]) => !doc?.credentials?.has(field));
    return {
      provider,
      doc,
      missing,
      sourceFieldCount: credentials.length,
      action: !doc ? "insert" : missing.length ? "update" : "skip",
    };
  });
};

const handler = async (context) => {
  const plan = await planImport();
  const inserts = plan.filter((item) => item.action === "insert").length;
  const updates = plan.filter((item) => item.action === "update").length;
  const skips = plan.filter((item) => item.action === "skip").length;

  // Fail before announcing or attempting imports. Dry runs remain usable
  // without a key because they never read or persist credential values.
  if (!context.dryRun && (inserts || updates)) assertCredentialEncryptionConfigured();

  for (const item of plan) {
    // Field names are safe operational metadata; values are never emitted.
    context.logger.info(`${context.dryRun ? "Would import" : "Importing"} ${item.missing.length} missing field(s) for ${item.provider}; existing managed fields are preserved.`);
  }
  if (!plan.length) context.logger.warn("No supported integration credentials were found in the centralized environment configuration.");

  if (context.dryRun) {
    return { wouldInsert: inserts, wouldUpdate: updates, wouldSkip: skips, wouldDelete: 0 };
  }

  for (const item of plan) {
    if (item.action === "skip") continue;
    const doc = item.doc || new IntegrationCredential({ provider: item.provider, enabled: true });
    for (const [field, value] of item.missing) doc.credentials.set(field, encryptCredential(value));
    await doc.save();
  }

  return {
    inserted: inserts,
    updated: updates,
    skipped: skips,
    deleted: 0,
    warnings: plan.length ? [] : ["No supported integrations were configured in config/envs.js."],
  };
};

const healthCheck = async () => {
  const sources = configuredEnvironment();
  if (!sources.length) {
    return { status: "NOT_APPLICABLE", detail: "No supported integration credentials are present in config/envs.js." };
  }
  const docs = await IntegrationCredential.find({
    provider: { $in: sources.map(({ provider }) => provider) },
  }).select("provider +credentials");
  const complete = sources.filter(({ provider, credentials }) => {
    const doc = docs.find((candidate) => candidate.provider === provider);
    return doc && credentials.every(([field]) => doc.credentials?.has(field));
  }).length;
  return {
    status: complete === sources.length ? "HEALTHY" : "DEGRADED",
    expected: sources.length,
    actual: complete,
    detail: `${complete}/${sources.length} envs.js-configured integration provider(s) imported into encrypted managed storage.`,
  };
};

export { configuredEnvironment, planImport };

export default {
  key: "integration-credentials",
  name: "Import Integration Credentials",
  description: "Imports supported third-party credentials from the centralized config/envs.js configuration into encrypted managed storage. Existing managed fields are never overwritten, and credential values never appear in logs or results.",
  type: "SEEDER",
  category: "security",
  version: 1,
  required: false,
  idempotent: true,
  risk: "HIGH",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: "Creates or completes up to five encrypted IntegrationCredential records without overwriting managed values.",
  supportsDryRun: true,
  requiresConfirmation: true,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
