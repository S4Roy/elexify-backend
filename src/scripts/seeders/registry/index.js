// Aggregates every data-operations registry entry and validates them at
// module-load time — fails fast (throws on import) rather than silently
// admitting a duplicate key or a malformed entry, per the plan's explicit
// requirement. This is the ONLY place operation keys are enumerated:
// runner.js, the admin controllers, and cli.js all resolve a key through
// getOperation()/listOperations() here — nothing in this system ever
// accepts a free-form script path or shell command.
import emailTemplates from "./operations/email-templates.js";
import emailTemplatesUpgrade from "./operations/email-templates-upgrade.js";
import cmsPages from "./operations/cms-pages.js";
import faqs from "./operations/faqs.js";
import homePage from "./operations/home-page.js";
import shipping from "./operations/shipping.js";
import companySettings from "./operations/company-settings.js";
import contactSettings from "./operations/contact-settings.js";
import pincodes from "./operations/pincodes.js";
import restrictCountries from "./operations/restrict-countries.js";
import coreSiteBootstrap from "./operations/core-site-bootstrap.js";
import orderTotalItemsBackfill from "./operations/order-total-items-backfill.js";
import orderSchemaMigration from "./operations/order-schema-migration.js";
import fixCartIndexes from "./operations/fix-cart-indexes.js";
import fixUserIndexes from "./operations/fix-user-indexes.js";
import fixWishlistIndexes from "./operations/fix-wishlist-indexes.js";
import fixProductContent from "./operations/fix-product-content.js";
import dedupeUserMobiles from "./operations/dedupe-user-mobiles.js";
import normalizeExistingMobiles from "./operations/normalize-existing-mobiles.js";
import e2eCleanup from "./operations/e2e-cleanup.js";
import e2eSeed from "./operations/e2e-seed.js";
import e2eSeedAdmin from "./operations/e2e-seed-admin.js";

const RAW_ENTRIES = [
  emailTemplates,
  emailTemplatesUpgrade,
  cmsPages,
  faqs,
  homePage,
  shipping,
  companySettings,
  contactSettings,
  pincodes,
  restrictCountries,
  coreSiteBootstrap,
  orderTotalItemsBackfill,
  orderSchemaMigration,
  fixCartIndexes,
  fixUserIndexes,
  fixWishlistIndexes,
  fixProductContent,
  dedupeUserMobiles,
  normalizeExistingMobiles,
  e2eCleanup,
  e2eSeed,
  e2eSeedAdmin,
];

const VALID_TYPES = new Set(["SEEDER", "MIGRATION", "BACKFILL", "REPAIR"]);
const VALID_RISK = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const VALID_ENVIRONMENTS = new Set(["development", "test", "production"]);
const REQUIRED_STRING_FIELDS = ["key", "name", "description", "category", "estimatedImpact", "permission"];
const REQUIRED_BOOLEAN_FIELDS = ["required", "idempotent", "supportsDryRun", "requiresConfirmation"];

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const assertValidEntry = (entry, index) => {
  const label = entry?.key ? `operation "${entry.key}"` : `registry entry at index ${index}`;

  if (!entry || typeof entry !== "object") {
    throw new Error(`Invalid data-operations registry entry at index ${index}: expected an object, got ${typeof entry}.`);
  }
  if (!KEY_PATTERN.test(entry.key || "")) {
    throw new Error(`Invalid data-operations registry entry key "${entry.key}": must be lowercase-kebab-case.`);
  }
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof entry[field] !== "string" || !entry[field].trim()) {
      throw new Error(`Malformed registry entry (${label}): "${field}" must be a non-empty string.`);
    }
  }
  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof entry[field] !== "boolean") {
      throw new Error(`Malformed registry entry (${label}): "${field}" must be a boolean.`);
    }
  }
  if (!VALID_TYPES.has(entry.type)) {
    throw new Error(`Malformed registry entry (${label}): "type" must be one of ${[...VALID_TYPES].join(", ")}, got "${entry.type}".`);
  }
  if (!VALID_RISK.has(entry.risk)) {
    throw new Error(`Malformed registry entry (${label}): "risk" must be one of ${[...VALID_RISK].join(", ")}, got "${entry.risk}".`);
  }
  if (!Array.isArray(entry.allowedEnvironments) || !entry.allowedEnvironments.length) {
    throw new Error(`Malformed registry entry (${label}): "allowedEnvironments" must be a non-empty array.`);
  }
  for (const env of entry.allowedEnvironments) {
    if (!VALID_ENVIRONMENTS.has(env)) {
      throw new Error(`Malformed registry entry (${label}): unknown environment "${env}" in allowedEnvironments.`);
    }
  }
  if (!Array.isArray(entry.dependencies)) {
    throw new Error(`Malformed registry entry (${label}): "dependencies" must be an array (use [] for none).`);
  }
  if (entry.version === undefined || entry.version === null) {
    throw new Error(`Malformed registry entry (${label}): "version" is required.`);
  }
  if (typeof entry.handler !== "function") {
    throw new Error(`Malformed registry entry (${label}): "handler" must be an async function.`);
  }
  if (entry.healthCheck !== undefined && typeof entry.healthCheck !== "function") {
    throw new Error(`Malformed registry entry (${label}): "healthCheck", if present, must be a function.`);
  }
};

// Exposed purely so the registry's own validation rules (duplicate-key /
// malformed-entry rejection) can be unit tested without needing a real
// Mongo connection or importing every production operation module — see
// registry.test.js. Not used by any production code path.
export const buildRegistry = (entries) => {
  const map = new Map();
  entries.forEach((entry, index) => {
    assertValidEntry(entry, index);
    if (map.has(entry.key)) {
      throw new Error(`Duplicate data-operations registry key: "${entry.key}". Every operation key must be unique.`);
    }
    map.set(entry.key, entry);
  });
  return map;
};

const REGISTRY = buildRegistry(RAW_ENTRIES);

export const listOperations = () => [...REGISTRY.values()];

export const getOperation = (key) => REGISTRY.get(key);

export const hasOperation = (key) => REGISTRY.has(key);
