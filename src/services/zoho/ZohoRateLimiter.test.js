import { beforeEach, describe, expect, it, vi } from "vitest";
import { reserveRequestSlot } from "./ZohoRateLimiter.js";
import ZohoConnection from "../../models/ZohoConnection.js";
import { setTimeout as sleep } from "node:timers/promises";

vi.mock("../../models/ZohoConnection.js", () => ({ default: { findOneAndUpdate: vi.fn() } }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => vi.clearAllMocks());
describe("organization-wide Zoho rate slots", () => {
  it("reserves against the current connection generation and waits its turn", async () => {
    ZohoConnection.findOneAndUpdate.mockResolvedValue({ next_request_at: new Date(Date.now() + 1500) });
    await reserveRequestSlot({ _id: "connection", generation: 2 });
    expect(ZohoConnection.findOneAndUpdate).toHaveBeenCalledWith({ _id: "connection", connected: true, generation: 2 }, expect.any(Array), { new: true });
    expect(sleep).toHaveBeenCalledWith(expect.any(Number));
  });
  it("rejects work after disconnect or rotation", async () => {
    ZohoConnection.findOneAndUpdate.mockResolvedValue(null);
    await expect(reserveRequestSlot({})).rejects.toThrow("ZOHO_CONNECTION_CHANGED");
  });
  it("defers long waits to the durable queue", async () => {
    ZohoConnection.findOneAndUpdate.mockResolvedValue({ next_request_at: new Date(Date.now() + 60000) });
    await expect(reserveRequestSlot({})).rejects.toMatchObject({ code: "ZOHO_RATE_LIMIT_WAIT", retryable: true });
    expect(sleep).not.toHaveBeenCalled();
  });
});
