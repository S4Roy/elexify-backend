import { createPrivateKey } from "node:crypto";
import { getIntegrationConfig } from "../../integrationCredentials/index.js";

export function pushEnvironmentDefaults() {
  return {
    project_id: process.env.FCM_PROJECT_ID,
    environment: process.env.FCM_ENVIRONMENT,
    test_user_ids: process.env.PUSH_TEST_USER_IDS || "",
    enabled: process.env.PUSH_ENABLED === "true",
  };
}
// Admins usually copy private_key straight out of the service-account JSON,
// often with its quotes, a trailing comma and literal "\n" escapes — or
// paste the whole JSON file. Accept all of those so the stored value is a
// clean multi-line PEM.
export function normalizePrivateKey(value) {
  let key = String(value ?? "").trim();
  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key);
      if (typeof parsed?.private_key === "string") key = parsed.private_key;
    } catch { /* not JSON after all — fall through */ }
  }
  key = key.replace(/,\s*$/, "").trim();
  if (/^"[\s\S]*"$/.test(key)) key = key.slice(1, -1);
  return key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim() + "\n";
}
// Says what is wrong with a key that won't parse, without echoing any of it.
function privateKeyProblem(pem) {
  if (!pem.includes("-----BEGIN PRIVATE KEY-----"))
    return "The private key must start with -----BEGIN PRIVATE KEY----- (copy the whole private_key value, or paste the entire service-account JSON).";
  if (!pem.includes("-----END PRIVATE KEY-----"))
    return "The private key is incomplete: the -----END PRIVATE KEY----- line is missing. Copy the whole private_key value, or paste the entire service-account JSON.";
  return "Enter the service account RSA private key in PEM format (copy the whole private_key value, or paste the entire service-account JSON).";
}
export function validateManagedPush(values) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(values.project_id || ""))
    throw new Error("Enter a valid Firebase project ID.");
  if (!["development", "staging", "production"].includes(process.env.APP_ENV) || values.environment !== process.env.APP_ENV)
    throw new Error("Firebase environment must match the server APP_ENV.");
  const ids = (values.test_user_ids || "").split(",").map(v => v.trim()).filter(Boolean);
  if (ids.some(id => !/^[a-f0-9]{24}$/i.test(id))) throw new Error("Test customer IDs must be comma-separated MongoDB IDs.");
  if (values.environment !== "production" && (!process.env.FCM_PRODUCTION_PROJECT_ID || values.project_id === process.env.FCM_PRODUCTION_PROJECT_ID || !ids.length))
    throw new Error("Non-production requires a separate Firebase project, server production-project guard, and test customer IDs.");
  if (values.client_email || values.private_key) {
    if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(values.client_email || ""))
      throw new Error("Enter a valid service account client email.");
    const pem = normalizePrivateKey(values.private_key);
    let key;
    try { key = createPrivateKey(pem); } catch { throw new Error(privateKeyProblem(pem)); }
    if (key.asymmetricKeyType !== "rsa") throw new Error("The service account key must be an RSA private key.");
  }
}
export async function pushConfig() {
  const environment = process.env.APP_ENV;
  let managed;
  try {
    // A managed record's enabled flag takes precedence; explicit false from
    // the environment remains an emergency stop independent of admin access.
    managed = await getIntegrationConfig("firebase_push", { ...pushEnvironmentDefaults(), enabled: process.env.PUSH_ENABLED === "true" });
  } catch {
    console.error("push_configuration_unavailable");
    return { enabled: false, environment, allowedUsers: [] };
  }
  const projectId = managed?.project_id;
  const allowedUsers = (managed?.test_user_ids || "").split(",").map(v => v.trim()).filter(Boolean);
  const enabled = !!managed && managed.enabled !== false && process.env.PUSH_ENABLED !== "false" &&
    ["development", "staging", "production"].includes(environment) && !!projectId && managed.environment === environment &&
    (environment === "production" || (!!process.env.FCM_PRODUCTION_PROJECT_ID && projectId !== process.env.FCM_PRODUCTION_PROJECT_ID && allowedUsers.length > 0));
  return { enabled: !!enabled, environment, projectId, allowedUsers,
    clientEmail: managed?.client_email, privateKey: managed?.private_key?.replace(/\\n/g, "\n") };
}
export async function eligibleEnvironmentUser(userId, config) {
  const c = config || await pushConfig();
  return c.enabled && (c.environment === "production" || c.allowedUsers.includes(String(userId)));
}
