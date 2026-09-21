import { describe, expect, it } from "vitest";
import { shiprocketEventDate, shiprocketStatusFields } from "./shiprocketStatus.js";

describe("Shiprocket status snapshots", () => {
  it("parses documented carrier timestamps in India time", () => {
    expect(shiprocketEventDate("21 09 2026 08:30:00").toISOString()).toBe("2026-09-21T03:00:00.000Z");
    expect(shiprocketEventDate("2026-09-21T03:00:00Z").toISOString()).toBe("2026-09-21T03:00:00.000Z");
  });
  it("does not overwrite a newer provider status with an older event", () => {
    expect(shiprocketStatusFields("IN TRANSIT", new Date("2026-09-20"), {
      shiprocket_status: "OUT FOR DELIVERY", shiprocket_status_updated_at: new Date("2026-09-21"),
    })).toEqual({});
  });
  it("preserves unmapped provider exceptions and rejects missing status text", () => {
    const at = new Date();
    expect(shiprocketStatusFields(" RTO IN TRANSIT ", at)).toEqual({ shiprocket_status: "RTO IN TRANSIT", shiprocket_status_updated_at: at });
    expect(shiprocketStatusFields(undefined, at)).toEqual({});
    expect(Number.isNaN(shiprocketEventDate("invalid").valueOf())).toBe(false);
  });
});
