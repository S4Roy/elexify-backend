import { describe, expect, it } from "vitest";
import { normalizeOrderStatus } from "./normalizeOrderStatus.js";

describe("normalizeOrderStatus", () => {
  it.each([
    // Pre-pickup — Shiprocket's own "Forward Order Status" vocabulary
    // (support.shiprocket.in/.../important-terms-all-shiprocket-users-should-know)
    ["Pickup Scheduled", "packed"],
    ["Pickup Rescheduled", "packed"],
    ["Out for Pickup", "packed"],
    // In transit
    ["Picked Up", "shipped"],
    ["In-Transit", "shipped"],
    ["Reached-at-Destination Hub", "shipped"],
    ["Delayed", "shipped"],
    ["Misrouted", "shipped"],
    // Terminal
    ["Out for Delivery", "out_for_delivery"],
    ["Delivered", "delivered"],
    ["Cancelled", "cancelled"],
    ["Canceled", "cancelled"],
    // WooCommerce paid-awaiting-fulfilment and our own statuses
    ["processing", "confirmed"],
    ["confirmed", "confirmed"],
    ["on-hold", "confirmed"],
  ])("maps %s to %s", (input, expected) => {
    expect(normalizeOrderStatus(input)).toBe(expected);
  });

  it.each([
    // Exception/RTO outcomes are deliberately left unmapped — they're not
    // forward progress and shouldn't be silently folded into one.
    "Pickup Error",
    "Pickup Exception",
    "Undelivered",
    "RTO Initiated",
    "RTO Delivered",
    "Lost",
    "Damaged",
    "Destroyed",
  ])("leaves %s unmapped", (input) => {
    expect(normalizeOrderStatus(input)).toBeNull();
  });
});
