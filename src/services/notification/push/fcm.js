import { GoogleAuth } from "google-auth-library";
import { pushConfig, eligibleEnvironmentUser } from "./config.js";
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
});
export function classifyFcmFailure(status, body) {
  const detail = body?.error?.details?.find(
    (d) => d["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError"
  );
  const code = detail?.errorCode || body?.error?.status || "FCM_ERROR";
  return {
    code,
    invalid: code === "UNREGISTERED",
    retry: status === 429 || status >= 500,
  };
}
async function accessToken() {
  let timer;
  try {
    return await Promise.race([
      auth.getClient().then((client) => client.getAccessToken()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("auth_timeout")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function sendFcm(device, notification) {
  const c = pushConfig();
  if (
    !eligibleEnvironmentUser(notification.user_id) ||
    device.environment !== c.environment ||
    device.project_id !== c.projectId
  ) {
    return { success: false, code: "ENVIRONMENT_BLOCKED", retry: false };
  }
  try {
    const access = await accessToken();
    if (!access.token)
      return { success: false, code: "FCM_AUTH_ERROR", retry: false };
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        c.projectId
      )}/messages:send`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${access.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: {
              title: notification.title,
              body: notification.body,
              ...(notification.image_url
                ? { image: notification.image_url }
                : {}),
            },
            data: {
              notificationId: String(notification._id),
              type: notification.type,
            },
            android: {
              priority: notification.priority === "high" ? "HIGH" : "NORMAL",
              ttl: `${Math.max(
                0,
                Math.min(
                  86400,
                  Math.floor(
                    (new Date(notification.expires_at).getTime() - Date.now()) /
                      1000
                  )
                )
              )}s`,
              notification: { tag: String(notification._id) },
            },
            apns: {
              headers: {
                "apns-collapse-id": String(notification._id),
                "apns-expiration": String(
                  Math.floor(new Date(notification.expires_at).getTime() / 1000)
                ),
              },
            },
          },
        }),
      }
    );
    const body = await response.json();
    if (response.ok) return { success: true, messageId: body.name };
    const retryHeader = response.headers?.get("retry-after");
    const seconds =
      retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : 0;
    const retryAfterMs = seconds
      ? seconds * 1000
      : retryHeader
      ? Math.max(0, Date.parse(retryHeader) - Date.now()) || 0
      : 0;
    return {
      success: false,
      ...classifyFcmFailure(response.status, body),
      retryAfterMs,
    };
  } catch {
    // Never persist provider exception text: it can contain request headers/tokens.
    return { success: false, code: "FCM_TRANSPORT_ERROR", retry: true };
  }
}
