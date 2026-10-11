import { beforeEach, describe, expect, it, vi } from "vitest";
import Package from "../../../models/Package.js";
import Order from "../../../models/Order.js";
import OrderItem from "../../../models/OrderItem.js";
import Address from "../../../models/Address.js";
import { s3Client } from "../../awsService/awsConfig.js";
import { getProofPhoto, listMyDeliveries, uploadProofPhoto } from "./deliveryRun.js";

vi.mock("../../../models/Package.js", () => ({ default: { find: vi.fn(), findById: vi.fn() } }));
vi.mock("../../../models/Order.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../../models/OrderItem.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../../models/Address.js", () => ({ default: { find: vi.fn() } }));
vi.mock("../../../models/User.js", () => ({ default: {} }));
vi.mock("../../../models/Role.js", () => ({ default: {} }));
vi.mock("../../awsService/awsConfig.js", () => ({ s3Client: { send: vi.fn() } }));
vi.mock("./manualFulfillment.js", () => ({
  codAmountDue: (o) => (o.payment_method === "cod" && o.payment_status === "pending" ? o.grand_total : 0),
  staffName: (u) => u?.name || null,
}));

const RIDER = "507f1f77bcf86cd799439044";
const sortLean = (v) => ({ sort: () => ({ lean: () => Promise.resolve(v) }) });
const selectLean = (v) => ({ select: () => ({ lean: () => Promise.resolve(v) }) });

beforeEach(() => vi.resetAllMocks());

describe("listMyDeliveries", () => {
  it("returns only the rider's packages with the handover essentials", async () => {
    Package.find.mockReturnValue(sortLean([{
      _id: "p1", order_id: "o1", status: "out_for_delivery", shipped_at: new Date(), items: [{ order_item_id: "i1", quantity: 2 }],
      delivery_attempts: [{ at: new Date(), reason: "Not home" }],
    }]));
    Order.find.mockReturnValue(selectLean([{ _id: "o1", id: "ORD-1", shipping_address: "a1", payment_method: "cod",
      payment_status: "pending", grand_total: 750, currency: "INR" }]));
    OrderItem.find.mockReturnValue(selectLean([{ _id: "i1", order_id: "o1", product_name: "Kettle", variation_name: "Red", quantity: 2 }]));
    Address.find.mockReturnValue({ lean: () => Promise.resolve([{ _id: "a1", full_name: "Asha", phone_code: "91", phone: "98765",
      address_line_1: "12 Park St", city_name: "Kolkata", postcode: "700016" }]) });

    const { open, done } = await listMyDeliveries(RIDER);
    expect(String(Package.find.mock.calls[0][0]["delivery_agent.user_id"])).toBe(RIDER);
    expect(done).toEqual([]);
    expect(open[0]).toMatchObject({
      order_number: "ORD-1", cod_due: 750,
      address: { name: "Asha", phone: "+91 98765", line1: "12 Park St", city: "Kolkata", postcode: "700016" },
      items: [{ name: "Kettle · Red", quantity: 2 }],
      attempts: [{ reason: "Not home" }],
    });
    expect(open[0]).not.toHaveProperty("grand_total");
  });
});

describe("proof photos", () => {
  it("uploads privately under the package and rejects non-images", async () => {
    const key = await uploadProofPhoto({ packageId: "p1", file: { mimetype: "image/jpeg", size: 1000, data: Buffer.from("x") } });
    expect(key).toMatch(/^delivery-proof\/p1\/\d+-[0-9a-f]{12}\.jpg$/);
    expect(s3Client.send.mock.calls[0][0].input).not.toHaveProperty("ACL");
    await expect(uploadProofPhoto({ packageId: "p1", file: { mimetype: "application/pdf", size: 10 } })).rejects.toThrow(/JPEG/);
  });

  it("serves a photo only to the assigned rider", async () => {
    Package.findById.mockReturnValue(selectLean({ proof_of_delivery: { photo_key: "k" }, delivery_agent: { user_id: RIDER } }));
    s3Client.send.mockResolvedValue({ Body: "stream", ContentType: "image/png" });
    await expect(getProofPhoto({ packageId: "507f1f77bcf86cd799439011", riderId: "507f1f77bcf86cd799439099" })).rejects.toThrow(/not found/);
    expect(await getProofPhoto({ packageId: "507f1f77bcf86cd799439011", riderId: RIDER })).toEqual({ body: "stream", contentType: "image/png" });
  });
});
