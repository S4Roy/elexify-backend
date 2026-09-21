import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("./getTokens.js", () => ({ getTokens: vi.fn() }));
vi.mock("./invalidateToken.js", () => ({ invalidateToken: vi.fn() }));
import axios from "axios";
import { getTokens } from "./getTokens.js";
import { invalidateToken } from "./invalidateToken.js";
import { serviceability } from "./serviceability.js";
const params = { pickup_pincode: "700001", delivery_pincode: "700160", weight_kg: 2, cod: 1, timeout_ms: 5000 };
const response = { data: { available_courier_companies: [{ courier_company_id: 43, estimated_delivery_days: "4", rate: 54 }] } };
beforeEach(() => { vi.resetAllMocks(); getTokens.mockResolvedValue("test-token"); invalidateToken.mockResolvedValue(); });
describe("serviceability API adapter", () => {
  it("sends server-side route, kg weight and COD flag and retains documented ETA fields", async () => {
    axios.get.mockResolvedValue({ data: response });
    const result = await serviceability(params);
    const [url, options] = axios.get.mock.calls[0];
    expect(new URL(url).searchParams.get("pickup_postcode")).toBe("700001");
    expect(new URL(url).searchParams.get("delivery_postcode")).toBe("700160");
    expect(new URL(url).searchParams.get("weight")).toBe("2");
    expect(new URL(url).searchParams.get("cod")).toBe("1");
    expect(options.timeout).toBe(5000);
    expect(result.couriers[0]).toMatchObject({ courier_id: 43, eta: "4" });
    expect(result.raw).toEqual(response);
  });
  it("refreshes expired authentication once and fails safely on upstream errors", async () => {
    axios.get.mockRejectedValueOnce({ response: { status: 401 } }).mockResolvedValueOnce({ data: response });
    expect((await serviceability(params)).success).toBe(true);
    expect(invalidateToken).toHaveBeenCalledTimes(1);
    expect(getTokens).toHaveBeenCalledTimes(2);
    axios.get.mockRejectedValue(new Error("timeout"));
    expect((await serviceability(params)).success).toBe(false);
  });
});
