import { beforeEach, describe, expect, it, vi } from "vitest";
import Cart from "../../../models/Cart.js";
import TempCart from "../../../models/TempCart.js";
import { transferGuestCartToUser } from "./transferGuestCartToUser.js";
import { transferGuestTempCartToUser } from "./transferGuestTempCartToUser.js";

vi.mock("../../../models/Cart.js", () => ({
  default: { find: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("../../../models/TempCart.js", () => ({
  default: { find: vi.fn(), findOne: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn() },
}));

describe.each([
  ["cart", Cart, transferGuestCartToUser],
  ["buy-now cart", TempCart, transferGuestTempCartToUser],
])("guest %s merge used by OTP and Google login", (_, model, transfer) => {
  const user = "507f1f77bcf86cd799439011";
  const guestItem = {
    _id: "guest-row", product: "product", variation: "variant", quantity: 2,
    price: 100, discounted_price: 90,
  };

  beforeEach(() => vi.resetAllMocks());

  it("transfers ownership without losing the item or quantity", async () => {
    model.find.mockResolvedValue([guestItem]);
    model.findOne.mockResolvedValue(null);
    await transfer("guest-id", user);
    expect(model.find).toHaveBeenCalledWith({ guest_id: "guest-id", deleted_at: null });
    expect(model.updateOne).toHaveBeenCalledWith({ _id: "guest-row" }, {
      $set: { user }, $unset: { guest_id: "" },
    });
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it("adds guest quantities to the matching account product and variant", async () => {
    model.find.mockResolvedValue([guestItem]);
    model.findOne.mockResolvedValue({ _id: "account-row", quantity: 3 });
    await transfer("guest-id", user);
    expect(model.findOne).toHaveBeenCalledWith(expect.objectContaining({
      product: "product", variation: "variant", deleted_at: null,
    }));
    expect(model.updateOne).toHaveBeenCalledWith({ _id: "account-row" }, {
      $inc: { quantity: 2 }, $set: { price: 100, discounted_price: 90 },
    });
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: "guest-row" });
  });

  it("keeps the guest row if updating the account cart fails", async () => {
    model.find.mockResolvedValue([guestItem]);
    model.findOne.mockResolvedValue({ _id: "account-row" });
    model.updateOne.mockRejectedValue(new Error("Database unavailable"));
    await expect(transfer("guest-id", user)).rejects.toThrow("Database unavailable");
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it("does not change an account cart when no guest items remain", async () => {
    model.find.mockResolvedValue([]);
    await transfer("guest-id", user);
    expect(model.updateOne).not.toHaveBeenCalled();
    expect(model.deleteOne).not.toHaveBeenCalled();
  });
});
