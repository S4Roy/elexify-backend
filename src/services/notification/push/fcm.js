import { GoogleAuth } from "google-auth-library";
import { pushConfig, eligibleEnvironmentUser } from "./config.js";
const defaultAuth = new GoogleAuth({
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
let managedAuth, managedIdentity;
function authFor(config) {
  if (!config.clientEmail && !config.privateKey) return defaultAuth;
  if (!config.clientEmail || !config.privateKey) throw new Error("incomplete_credentials");
  const identity = JSON.stringify([config.clientEmail, config.privateKey]);
  if (managedIdentity !== identity) {
    managedAuth = new GoogleAuth({ credentials: { client_email: config.clientEmail, private_key: config.privateKey }, scopes: ["https://www.googleapis.com/auth/firebase.messaging"] });
    managedIdentity = identity;
  }
  return managedAuth;
}
async function accessToken(config) {
  let timer;
  try {
    return await Promise.race([
      authFor(config).getClient().then((client) => client.getAccessToken()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("auth_timeout")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
// Android channel per notification type. IDs match the channels the app
// creates at startup (elexify-mobile .../NotificationChannels.kt): "orders"
// and "account" are high-importance (heads-up + lock screen), "offers" is
// default importance so promotions never interrupt.
const OFFER_TYPES = new Set(["PROMOTIONAL_CAMPAIGN", "BACK_IN_STOCK", "PRICE_DROP", "NEW_PRODUCT", "CART_ABANDONED"]);
const ACCOUNT_TYPES = /^(ACCOUNT_|PASSWORD_|EMAIL_CHANGED|MOBILE_CHANGED|SUSPICIOUS_)/;
export function androidChannelFor(type = "") {
  if (OFFER_TYPES.has(type)) return "offers";
  if (ACCOUNT_TYPES.test(type)) return "account";
  return "orders";
}
function androidNotification(notification) {
  const channel = androidChannelFor(notification.type);
  return {
    tag: String(notification._id),
    channel_id: channel,
    icon: "ic_stat_notification",
    color: "#00796A",
    default_sound: true,
    default_vibrate_timings: true,
    notification_priority: channel === "offers" ? "PRIORITY_DEFAULT" : "PRIORITY_HIGH",
    // Security notices stay redacted on a locked screen; order updates show.
    visibility: channel === "account" ? "PRIVATE" : "PUBLIC",
  };
}

export async function sendFcm(device, notification) {
  const c = await pushConfig();
  if (
    !(await eligibleEnvironmentUser(notification.user_id, c)) ||
    device.environment !== c.environment ||
    device.project_id !== c.projectId
  ) {
    return { success: false, code: "ENVIRONMENT_BLOCKED", retry: false };
  }
  try {
    const access = await accessToken(c);
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
              notification: androidNotification(notification),
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
