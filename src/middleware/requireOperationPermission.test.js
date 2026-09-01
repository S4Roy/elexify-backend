import { describe, expect, it } from "vitest";
import { requireOperationPermission, requireDataView, requireOperationHistoryView } from "./requireOperationPermission.js";

// Exercised directly against the middleware (celebrate-style: it calls
// next(err) on rejection, next() on success) rather than through a live
// HTTP server — same pattern as
// validations/admin/emailTemplate/emailTemplate.validation.test.js.
const runMiddleware = (middleware, { role, params = {} }) =>
  new Promise((resolve) => {
    const req = { auth: role ? { role } : null, params };
    const res = {};
    middleware(req, res, (err) => resolve(err));
  });

describe("requireOperationPermission — RBAC gate for /admin/data-operations/:key/*", () => {
  it("denies a role with no permissions at all (403)", async () => {
    const err = await runMiddleware(requireOperationPermission("view"), { role: "staff", params: { key: "email-templates" } });
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(403);
  });

  it("denies an unauthenticated request (no role on req.auth)", async () => {
    const err = await runMiddleware(requireOperationPermission("view"), { role: null, params: { key: "email-templates" } });
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(403);
  });

  it("allows manager to VIEW a SEEDER-type operation (email-templates) but DENIES execute", async () => {
    const viewErr = await runMiddleware(requireOperationPermission("view"), { role: "manager", params: { key: "email-templates" } });
    expect(viewErr).toBeFalsy();

    const executeErr = await runMiddleware(requireOperationPermission("execute"), { role: "manager", params: { key: "email-templates" } });
    expect(executeErr).toBeTruthy();
    expect(executeErr.statusCode).toBe(403);
  });

  it("allows manager to VIEW a MIGRATION-type operation (order-schema-migration) but DENIES execute", async () => {
    const viewErr = await runMiddleware(requireOperationPermission("view"), { role: "manager", params: { key: "order-schema-migration" } });
    expect(viewErr).toBeFalsy();

    const executeErr = await runMiddleware(requireOperationPermission("execute"), { role: "manager", params: { key: "order-schema-migration" } });
    expect(executeErr).toBeTruthy();
  });

  it("allows manager to VIEW a REPAIR-type operation (fix-cart-indexes) but DENIES execute", async () => {
    const viewErr = await runMiddleware(requireOperationPermission("view"), { role: "manager", params: { key: "fix-cart-indexes" } });
    expect(viewErr).toBeFalsy();

    const executeErr = await runMiddleware(requireOperationPermission("execute"), { role: "manager", params: { key: "fix-cart-indexes" } });
    expect(executeErr).toBeTruthy();
  });

  it("allows manager to VIEW a BACKFILL-type operation (order-total-items-backfill, grouped with migration permissions)", async () => {
    const viewErr = await runMiddleware(requireOperationPermission("view"), { role: "manager", params: { key: "order-total-items-backfill" } });
    expect(viewErr).toBeFalsy();
  });

  it("superadmin can execute every operation type", async () => {
    for (const key of ["email-templates", "order-schema-migration", "fix-cart-indexes", "order-total-items-backfill"]) {
      const err = await runMiddleware(requireOperationPermission("execute"), { role: "superadmin", params: { key } });
      expect(err).toBeFalsy();
    }
  });

  it("an unresolvable key never grants access — falls back to requiring the baseline DATA_VIEW permission", async () => {
    const staffErr = await runMiddleware(requireOperationPermission("view"), { role: "staff", params: { key: "not-a-real-key" } });
    expect(staffErr).toBeTruthy();

    const managerErr = await runMiddleware(requireOperationPermission("view"), { role: "manager", params: { key: "not-a-real-key" } });
    expect(managerErr).toBeFalsy(); // manager holds DATA_VIEW
  });

  it("requireDataView gates the list endpoint independent of any :key", async () => {
    const staffErr = await runMiddleware(requireDataView, { role: "staff" });
    expect(staffErr).toBeTruthy();

    const managerErr = await runMiddleware(requireDataView, { role: "manager" });
    expect(managerErr).toBeFalsy();
  });

  it("requireOperationHistoryView gates the executions endpoints", async () => {
    const staffErr = await runMiddleware(requireOperationHistoryView, { role: "staff" });
    expect(staffErr).toBeTruthy();

    const managerErr = await runMiddleware(requireOperationHistoryView, { role: "manager" });
    expect(managerErr).toBeFalsy();
  });
});
