import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditService } from "../../../services/index.js";
import { getPreferencesDoc } from "../../../services/notification/preferencesDoc.js";
import { updateNotificationPreferences } from "./notificationPreferences.js";

vi.mock("../../../services/index.js", () => ({ auditService: { recordAudit: vi.fn() } }));
vi.mock("../../../services/notification/preferencesDoc.js", () => ({ MANDATORY_LOCKED_PATHS: [], getPreferencesDoc: vi.fn() }));

const run = async (body) => {
  const doc = { marketing: { push: false, email: false }, transactional: {}, security: {}, reminders: {}, save: vi.fn(), toObject() { return this; } };
  getPreferencesDoc.mockResolvedValue(doc);
  const res = { status: () => res, json: vi.fn() };
  const next = vi.fn();
  await updateNotificationPreferences({ auth: { user_id: "u1" }, body, __: (s) => s }, res, next);
  return { doc, next };
};

describe("updateNotificationPreferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a promotional push opt-in and audits it as onboarding consent", async () => {
    const { doc, next } = await run({ marketing: { push: true }, source: "onboarding" });
    expect(next).not.toHaveBeenCalled();
    expect(doc.marketing).toEqual({ push: true, email: false });
    expect(auditService.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      event: "NOTIFICATION_PREFERENCES_CHANGED", metadata: { marketing: { push: true }, source: "onboarding" },
    }));
  });

  it("treats an unknown source as the settings screen", async () => {
    await run({ marketing: { push: false }, source: "<script>" });
    expect(auditService.recordAudit.mock.calls[0][0].metadata.source).toBe("settings");
  });
});
