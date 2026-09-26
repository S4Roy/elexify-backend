import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../models/Role.js", () => ({ default: { find: vi.fn(), updateOne: vi.fn(), countDocuments: vi.fn() } }));
vi.mock("../../../../services/rbac/owner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  seedPermissionCatalog: vi.fn(),
}));

import Role from "../../../../models/Role.js";
import { seedPermissionCatalog } from "../../../../services/rbac/owner.js";
import { PERMISSIONS } from "../../../../constants/adminPermissions.js";
import { MANAGEMENT_PERMISSIONS } from "../../../../constants/rbacPermissions.js";
import { ADMIN_ROLE_PRESETS } from "../../../../constants/adminRolePresets.js";
import operation, { unknownPresetPermissions } from "./admin-roles.js";

const existingRoles = (roles) => Role.find.mockReturnValue({ select: () => ({ lean: async () => roles }) });
const run = (dryRun = false) => operation.handler({ dryRun, logger: { info: vi.fn(), warn: vi.fn() } });

describe("admin role presets", () => {
  it("only reference registered permissions", () => {
    expect(unknownPresetPermissions()).toEqual([]);
    expect(unknownPresetPermissions([{ key: "preset-x", permissions: ["made.up"] }])).toEqual(["preset-x: made.up"]);
  });

  it("have unique preset- keys and no duplicate permissions", () => {
    const keys = ADMIN_ROLE_PRESETS.map((preset) => preset.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const preset of ADMIN_ROLE_PRESETS) {
      expect(preset.key).toMatch(/^preset-[a-z-]+$/);
      expect(new Set(preset.permissions).size).toBe(preset.permissions.length);
    }
  });

  it("keep owner-only permissions out of every preset", () => {
    const ownerOnly = [
      ...MANAGEMENT_PERMISSIONS, PERMISSIONS.INTEGRATION_CREDENTIAL_MANAGE, PERMISSIONS.ORDER_FORCE_CANCEL,
      PERMISSIONS.EMAIL_TEMPLATE_MANAGE, PERMISSIONS.SMS_TEMPLATE_MANAGE, PERMISSIONS.AUDIT_LOG_VIEW,
    ];
    for (const preset of ADMIN_ROLE_PRESETS) {
      expect(preset.permissions.filter((key) => ownerOnly.includes(key) || key.startsWith("system."))).toEqual([]);
    }
  });

  it("grant orders.refund wherever order cancellation is granted", () => {
    // The cancel route requires both keys.
    for (const preset of ADMIN_ROLE_PRESETS.filter((p) => p.permissions.includes(PERMISSIONS.ORDER_CANCEL_MANAGE))) {
      expect(preset.permissions).toContain("orders.refund");
    }
  });
});

describe("admin-roles seeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Role.updateOne.mockResolvedValue({ upsertedCount: 1 });
  });

  it("creates only the missing presets and never touches existing ones", async () => {
    const [edited, deleted] = ADMIN_ROLE_PRESETS;
    existingRoles([
      { key: edited.key, permissions: ["orders.view"], deleted_at: null },
      { key: deleted.key, permissions: deleted.permissions, deleted_at: new Date() },
    ]);
    const result = await run();

    const createdKeys = Role.updateOne.mock.calls.map(([filter]) => filter.key);
    expect(createdKeys).toEqual(ADMIN_ROLE_PRESETS.slice(2).map((preset) => preset.key));
    for (const [, update] of Role.updateOne.mock.calls) {
      expect(Object.keys(update)).toEqual(["$setOnInsert"]);
      expect(update.$setOnInsert).toMatchObject({ status: "active", system_role: false, protected: false });
    }
    expect(seedPermissionCatalog).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ inserted: ADMIN_ROLE_PRESETS.length - 2, skipped: 2 });
  });

  it("writes nothing on a dry run", async () => {
    existingRoles([{ key: ADMIN_ROLE_PRESETS[0].key, permissions: [], deleted_at: null }]);
    const result = await run(true);
    expect(Role.updateOne).not.toHaveBeenCalled();
    expect(seedPermissionCatalog).not.toHaveBeenCalled();
    expect(result).toEqual({ wouldInsert: ADMIN_ROLE_PRESETS.length - 1, wouldUpdate: 0, wouldSkip: 1, wouldDelete: 0 });
  });

  it("treats a concurrent insert as already created", async () => {
    existingRoles([]);
    Role.updateOne.mockRejectedValueOnce({ code: 11000 });
    const result = await run();
    expect(result).toMatchObject({ inserted: ADMIN_ROLE_PRESETS.length - 1, skipped: 1 });
  });
});
