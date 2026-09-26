import Role from "../../../../models/Role.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";
import { ADMIN_ROLE_PRESETS } from "../../../../constants/adminRolePresets.js";
import { registeredPermissionKeys, seedPermissionCatalog } from "../../../../services/rbac/owner.js";
import { buildResult } from "../../../shared/result.js";

const PRESET_KEYS = ADMIN_ROLE_PRESETS.map((preset) => preset.key);

// "<role key>: <permission>" for every preset permission missing from the catalog.
export const unknownPresetPermissions = (presets = ADMIN_ROLE_PRESETS, catalog = registeredPermissionKeys()) => {
  const known = new Set(catalog);
  return presets.flatMap(({ key, permissions }) =>
    permissions.filter((permission) => !known.has(permission)).map((permission) => `${key}: ${permission}`));
};

const sameSet = (a = [], b = []) => a.length === b.length && a.every((key) => b.includes(key));

// Create-only: a preset that already exists (even edited or deleted in the
// admin panel) is left exactly as it is.
const handler = async (context) => {
  const unknown = unknownPresetPermissions();
  if (unknown.length) throw new Error(`Role presets reference unregistered permissions: ${unknown.join(", ")}`);

  const existing = new Map(
    (await Role.find({ key: { $in: PRESET_KEYS } }).select("key permissions deleted_at").lean()).map((role) => [role.key, role]),
  );
  const missing = ADMIN_ROLE_PRESETS.filter((preset) => !existing.has(preset.key));

  for (const preset of ADMIN_ROLE_PRESETS) {
    const role = existing.get(preset.key);
    const state = !role
      ? (context.dryRun ? "would create" : "creating")
      : role.deleted_at ? "deleted in admin, not recreated"
        : sameSet(role.permissions, preset.permissions) ? "exists" : "exists with edited permissions, left unchanged";
    context.logger.info(`${preset.name} (${preset.permissions.length} permissions): ${state}.`);
  }

  if (context.dryRun) {
    return { wouldInsert: missing.length, wouldUpdate: 0, wouldSkip: existing.size, wouldDelete: 0 };
  }

  // Role creation validates against the catalog, so make sure every key is there.
  if (missing.length) await seedPermissionCatalog();

  let inserted = 0;
  for (const { key, ...preset } of missing) {
    try {
      const { upsertedCount } = await Role.updateOne(
        { key },
        { $setOnInsert: { ...preset, status: "active", system_role: false, protected: false, deleted_at: null } },
        { upsert: true },
      );
      inserted += upsertedCount;
    } catch (error) {
      // A concurrent run created it first.
      if (error.code !== 11000) throw error;
    }
  }
  return buildResult({ inserted, skipped: ADMIN_ROLE_PRESETS.length - inserted });
};

const healthCheck = async () => {
  // Deleted presets still count: removing one in the admin panel is a choice, not drift.
  const actual = await Role.countDocuments({ key: { $in: PRESET_KEYS } });
  return {
    status: actual === PRESET_KEYS.length ? "HEALTHY" : "DEGRADED",
    expected: PRESET_KEYS.length,
    actual,
    detail: actual === PRESET_KEYS.length
      ? "All starter admin roles have been created."
      : `${PRESET_KEYS.length - actual} starter admin role(s) not created yet.`,
  };
};

export default {
  key: "admin-roles",
  name: "Seed starter admin roles",
  description:
    "Creates starter admin roles (Store Manager, Catalog Manager, Order Manager, Warehouse Staff, Customer Support, Marketing Manager, Content Editor, Accounts & Finance, Read-only Viewer). Never changes a role that already exists.",
  type: "SEEDER",
  category: "access",
  version: 1,
  required: false,
  idempotent: true,
  risk: "LOW",
  allowedEnvironments: ["development", "test", "production"],
  dependencies: [],
  estimatedImpact: `Inserts up to ${PRESET_KEYS.length} role documents; assigns them to no one.`,
  supportsDryRun: true,
  requiresConfirmation: false,
  permission: PERMISSIONS.SEEDER_EXECUTE,
  handler,
  healthCheck,
};
