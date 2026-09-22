import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./sendNotification.js", () => ({ sendNotification: vi.fn() }));
vi.mock("./buildOrderEmailData.js", () => ({ buildOrderEmailData: vi.fn() }));
import { sendNotification } from "./sendNotification.js";
import { buildOrderEmailData } from "./buildOrderEmailData.js";
import { sendOrderNotification } from "./sendOrderNotification.js";

beforeEach(() => {
  vi.clearAllMocks();
  buildOrderEmailData.mockResolvedValue({ grand_total: 1000 });
});

it.each([[false, 1000], [true, 200]])("uses the received amount for partial COD=%s", async (partial, expected) => {
  sendOrderNotification({
    order: { id: "ORD-1", user: "user", grand_total: 1000, advance_amount: 200, is_partial_cod: partial },
    event: "PAYMENT_SUCCESS",
  });
  await Promise.resolve();
  expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ order_id: "ORD-1", payment_amount: expected }),
  }));
});
