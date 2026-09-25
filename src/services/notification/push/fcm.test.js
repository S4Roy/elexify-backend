import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: "server-only-secret" }) };
    }
  },
}));
import { sendFcm } from "./fcm.js";
const fetchMock = vi.fn();
const device = {
  token: "device-secret",
  environment: "staging",
  project_id: "stage",
};
const notification = {
  _id: "notification-id",
  user_id: "test-user",
  type: "ORDER_SHIPPED",
  title: "Shipped",
  body: "Open Elexify",
  priority: "high",
  expires_at: new Date(Date.now() + 86400000),
};
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  for (const [key, value] of Object.entries({
    PUSH_ENABLED: "true",
    APP_ENV: "staging",
    FCM_ENVIRONMENT: "staging",
    FCM_PROJECT_ID: "stage",
    FCM_PRODUCTION_PROJECT_ID: "prod",
    PUSH_TEST_USER_IDS: "test-user",
  }))
    vi.stubEnv(key, value);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("submits a bounded, minimal FCM v1 payload with stable collapse identifiers", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ name: "fcm-message" }),
  });
  expect(await sendFcm(device, notification)).toEqual({
    success: true,
    messageId: "fcm-message",
  });
  const [url, request] = fetchMock.mock.calls[0];
  const payload = JSON.parse(request.body);
  expect(url).toBe(
    "https://fcm.googleapis.com/v1/projects/stage/messages:send"
  );
  expect(payload.message.data).toEqual({
    notificationId: "notification-id",
    type: "ORDER_SHIPPED",
  });
  expect(payload.message.android.notification.tag).toBe("notification-id");
  expect(payload.message.apns.headers["apns-collapse-id"]).toBe(
    "notification-id"
  );
});
it("blocks project/account mismatches before any network request", async () => {
  expect(
    await sendFcm({ ...device, project_id: "prod" }, notification)
  ).toMatchObject({ code: "ENVIRONMENT_BLOCKED", retry: false });
  expect(
    await sendFcm(device, { ...notification, user_id: "production-customer" })
  ).toMatchObject({ code: "ENVIRONMENT_BLOCKED" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("returns only safe error categories when transport errors contain secrets", async () => {
  fetchMock.mockRejectedValue(
    new Error("Authorization: server-only-secret device-secret")
  );
  expect(await sendFcm(device, notification)).toEqual({
    success: false,
    code: "FCM_TRANSPORT_ERROR",
    retry: true,
  });
});
