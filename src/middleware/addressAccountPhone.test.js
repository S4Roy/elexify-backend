import { afterEach, describe, expect, it, vi } from "vitest";
import User from "../models/User.js";
import { addressAccountPhone } from "./addressAccountPhone.js";

afterEach(() => vi.restoreAllMocks());

describe("address account contact", () => {
  function account(value) {
    return vi.spyOn(User, "findOne").mockReturnValue({
      select: () => ({ lean: async () => value }),
    });
  }

  it.each([{}, { phone: "9999999999", phone_code: "1", email: "override@example.com" }])("uses the account number regardless of submitted contact %j", async body => {
    const find = account({ mobile: "9876543210", phone_code: "91", email: "account@example.com" });
    const req = { auth: { user_id: "customer" }, body: { ...body, postcode: "110001" } };
    const next = vi.fn();
    await addressAccountPhone(req, {}, next);
    expect(find).toHaveBeenCalledWith({ _id: "customer", deleted_at: null });
    expect(req.body).toEqual({ phone: "9876543210", phone_code: "91", email: "account@example.com", postcode: "110001" });
    expect(next).toHaveBeenCalledWith();
  });

  it.each([null, { mobile: null }, { mobile: "123" }])("rejects an unavailable account contact %j", async user => {
    account(user);
    const next = vi.fn();
    await addressAccountPhone({ auth: { user_id: "customer" }, body: { phone: "9999999999" } }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("keeps email optional for mobile-only accounts and clears submitted email", async () => {
    account({ mobile: "9876543210", phone_code: "91" });
    const req = { auth: { user_id: "customer" }, body: { email: "old@example.com" } };
    const next = vi.fn();
    await addressAccountPhone(req, {}, next);
    expect(req.body.email).toBeNull();
    expect(next).toHaveBeenCalledWith();
  });

  it("requires authentication", async () => {
    const next = vi.fn();
    await addressAccountPhone({ body: {} }, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
