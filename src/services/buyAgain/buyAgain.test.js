import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../models/Order.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../models/OrderItem.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../models/Product.js", () => ({ default: { findById: vi.fn() } }));
vi.mock("../../models/ProductVariation.js", () => ({ default: { findOne: vi.fn() } }));
vi.mock("../../models/Cart.js", () => ({ default: { findOne: vi.fn(), updateOne: vi.fn(), create: vi.fn() } }));
vi.mock("../../config/index.js", () => ({ StatusError: {
  unauthorized: (message) => Object.assign(new Error(message), { statusCode: 401 }),
  notFound: (message) => Object.assign(new Error(message), { statusCode: 404 }),
  badRequest: (message) => Object.assign(new Error(message), { statusCode: 400 }),
} }));
import Order from "../../models/Order.js";
import OrderItem from "../../models/OrderItem.js";
import Product from "../../models/Product.js";
import ProductVariation from "../../models/ProductVariation.js";
import Cart from "../../models/Cart.js";
import { previewBuyAgain, addBuyAgain } from "./index.js";
const item = { _id: "line-1", product_id: "product-1", product_name: "Historical name", quantity: 2, unit_price: 10 };
const product = { _id: "product-1", name: "Current name", type: "simple", status: "active", regular_price: 100,
  sale_price: 80, stock_quantity: 10, reserved_quantity: 2, quantity_discounts: [{ min_quantity: 5, discount_percent: 10 }] };
const lean = (value) => ({ lean: async () => value });
const selection = [{ order_item_id: "line-1", quantity: 2 }];
beforeEach(() => {
  vi.resetAllMocks();
  Order.findOne.mockReturnValue({ select: () => lean({ _id: "order-1" }) });
  OrderItem.find.mockReturnValue(lean([item]));
  Product.findById.mockReturnValue(lean(product));
  Cart.findOne.mockReturnValue(lean(null));
  Cart.updateOne.mockResolvedValue({ matchedCount: 1 });
  Cart.create.mockResolvedValue({});
});
describe("buy again", () => {
  it("requires a signed-in customer", async () => {
    await expect(previewBuyAgain(null, "order-1")).rejects.toMatchObject({ statusCode: 401 });
    expect(Order.findOne).not.toHaveBeenCalled();
  });
  it("does not reveal another customer's order", async () => {
    Order.findOne.mockReturnValue({ select: () => lean(null) });
    await expect(addBuyAgain("user-1", "order-1", selection)).rejects.toMatchObject({ statusCode: 404 });
    expect(Order.findOne).toHaveBeenCalledWith({ _id: "order-1", user: "user-1", deleted_at: null });
    expect(Cart.create).not.toHaveBeenCalled();
  });
  it("previews current prices and sellable stock without mutating the cart", async () => {
    expect((await previewBuyAgain("user-1", "order-1")).items[0]).toMatchObject({ name: "Current name", base_price: 80, max_quantity: 8, eligible: true });
    expect(Cart.create).not.toHaveBeenCalled();
  });
  it("subtracts existing cart quantities from availability", async () => {
    Cart.findOne.mockReturnValue(lean({ _id: "cart-1", quantity: 3 }));
    expect((await previewBuyAgain("user-1", "order-1")).items[0]).toMatchObject({ max_quantity: 5, existing_quantity: 3 });
  });
  it.each([{ status: "inactive" }, { deleted_at: new Date() }])("skips unavailable products: %j", async (changes) => {
    Product.findById.mockReturnValue(lean({ ...product, ...changes }));
    expect((await addBuyAgain("user-1", "order-1", selection)).results[0]).toMatchObject({ added: false, reason: "This product is no longer available." });
    expect(Cart.create).not.toHaveBeenCalled();
  });
  it("skips customised order items", async () => {
    OrderItem.find.mockReturnValue(lean([{ ...item, customization_id: "custom-1" }]));
    expect((await previewBuyAgain("user-1", "order-1")).items[0].eligible).toBe(false);
    expect(Product.findById).not.toHaveBeenCalled();
  });
  it("does not overwrite a customised cart row", async () => {
    Cart.findOne.mockReturnValue(lean({ _id: "cart-1", quantity: 1, customization_id: "custom-1" }));
    expect((await addBuyAgain("user-1", "order-1", selection)).results[0].added).toBe(false);
    expect(Cart.updateOne).not.toHaveBeenCalled();
  });
  it("rejects foreign selections before adding anything", async () => {
    await expect(addBuyAgain("user-1", "order-1", [...selection, { order_item_id: "other", quantity: 1 }])).rejects.toMatchObject({ statusCode: 400 });
    expect(Cart.create).not.toHaveBeenCalled();
  });
  it("adds quantities and reapplies current quantity discounts", async () => {
    const updatedAt = new Date();
    Cart.findOne.mockReturnValue(lean({ _id: "cart-1", quantity: 3, updatedAt }));
    expect((await addBuyAgain("user-1", "order-1", selection)).results[0]).toMatchObject({ added: true, cart_quantity: 5, unit_price: 72, added_quantity: 2 });
    expect(Cart.updateOne).toHaveBeenCalledWith({ _id: "cart-1", quantity: 3, deleted_at: null, updatedAt },
      { $set: { quantity: 5, price: 100, discounted_price: 72, discount_percent: 10, deleted_at: null } });
  });
  it("revives a deleted row without its old quantity", async () => {
    Cart.findOne.mockReturnValue(lean({ _id: "cart-1", quantity: 99, customization_id: "old-custom", deleted_at: new Date() }));
    await addBuyAgain("user-1", "order-1", selection);
    expect(Cart.updateOne.mock.calls[0][1].$set.quantity).toBe(2);
    expect(Cart.updateOne.mock.calls[0][1].$set.customization_id).toBeNull();
  });
  it("rechecks stock and does not silently reduce the requested quantity", async () => {
    expect((await addBuyAgain("user-1", "order-1", [{ order_item_id: "line-1", quantity: 9 }])).results[0]).toMatchObject({ added: false, max_quantity: 8 });
    expect(Cart.create).not.toHaveBeenCalled();
  });
  it("preserves concurrent cart quantity changes", async () => {
    Cart.findOne.mockReturnValueOnce(lean({ _id: "cart-1", quantity: 1 })).mockReturnValue(lean({ _id: "cart-1", quantity: 3 }));
    Cart.updateOne.mockResolvedValueOnce({ matchedCount: 0 }).mockResolvedValue({ matchedCount: 1 });
    expect((await addBuyAgain("user-1", "order-1", selection)).results[0]).toMatchObject({ added: true, cart_quantity: 5, unit_price: 72 });
  });
  it("handles concurrent row creation additively", async () => {
    Cart.findOne.mockReturnValueOnce(lean(null)).mockReturnValue(lean({ _id: "cart-1", quantity: 3 }));
    Cart.create.mockRejectedValueOnce({ code: 11000 });
    expect((await addBuyAgain("user-1", "order-1", selection)).results[0].cart_quantity).toBe(5);
  });
  it("reports partial success per item", async () => {
    OrderItem.find.mockReturnValue(lean([item, { ...item, _id: "line-2", customization_id: "custom-1" }]));
    const result = await addBuyAgain("user-1", "order-1", [...selection, { order_item_id: "line-2", quantity: 2 }]);
    expect(result.results.map((entry) => entry.added)).toEqual([true, false]);
    expect(Cart.create).toHaveBeenCalledTimes(1);
  });
  it("rejects inactive variants", async () => {
    OrderItem.find.mockReturnValue(lean([{ ...item, variation_id: "variant-1" }]));
    Product.findById.mockReturnValue(lean({ ...product, type: "variable" }));
    ProductVariation.findOne.mockReturnValue(lean({ _id: "variant-1", status: "inactive" }));
    expect((await previewBuyAgain("user-1", "order-1")).items[0].eligible).toBe(false);
    expect(ProductVariation.findOne).toHaveBeenCalledWith({ _id: "variant-1", product_id: "product-1" });
  });
  it("uses current variant prices and stock", async () => {
    OrderItem.find.mockReturnValue(lean([{ ...item, variation_id: "variant-1" }]));
    Product.findById.mockReturnValue(lean({ ...product, type: "variable" }));
    ProductVariation.findOne.mockReturnValue(lean({ _id: "variant-1", status: "active", regular_price: 150, stock_quantity: 4, reserved_quantity: 1 }));
    expect((await addBuyAgain("user-1", "order-1", selection)).results[0]).toMatchObject({ added: true, unit_price: 150, variation_id: "variant-1" });
    expect(Cart.create.mock.calls[0][0]).toMatchObject({ product: "product-1", variation: "variant-1", quantity: 2, price: 150 });
  });
});
