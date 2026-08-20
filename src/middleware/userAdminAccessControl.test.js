import { describe, expect, it, vi } from "vitest";
import { userAdminAccessControl } from "./userAdminAccessControl.js";

const ADMIN_PANEL_ROLES = ["superadmin", "manager", "supervisor", "staff", "operator"];
const STOREFRONT_ROLES = ["customer", "vendor", "user"];

describe("userAdminAccessControl", () => {
  for (const role of ADMIN_PANEL_ROLES) {
    it(`allows an authenticated "${role}" through`, () => {
      const req = { auth: { role } };
      const next = vi.fn();

      userAdminAccessControl(req, {}, next);

      expect(next).toHaveBeenCalledWith();
    });
  }

  for (const role of STOREFRONT_ROLES) {
    it(`rejects a storefront role ("${role}") with a 403`, () => {
      const req = { auth: { role } };
      const next = vi.fn();

      userAdminAccessControl(req, {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
  }

  it("rejects a request with no auth context at all", () => {
    const req = {};
    const next = vi.fn();

    userAdminAccessControl(req, {}, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
});
