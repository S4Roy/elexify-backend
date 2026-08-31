import { describe, expect, it } from "vitest";
import { getPreferenceValue } from "./preferencePath.js";

const preferences = {
  transactional: { order_email: true, order_sms: false, order_whatsapp: false },
  security: { email: true, sms: true },
  marketing: { email: false, sms: false, whatsapp: false },
  reminders: { abandoned_cart_email: false, abandoned_cart_whatsapp: false },
};

describe("getPreferenceValue", () => {
  it("resolves a mapped preference", () => {
    expect(getPreferenceValue(preferences, "order", "email")).toBe(true);
    expect(getPreferenceValue(preferences, "order", "sms")).toBe(false);
    expect(getPreferenceValue(preferences, "security", "email")).toBe(true);
    expect(getPreferenceValue(preferences, "marketing", "whatsapp")).toBe(false);
  });

  it("returns null for an unmapped preferenceKey/channel combination", () => {
    expect(getPreferenceValue(preferences, "security", "whatsapp")).toBeNull();
    expect(getPreferenceValue(preferences, "unknown_key", "email")).toBeNull();
  });
});
