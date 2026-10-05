import MobileUpdatePolicy from "../models/MobileUpdatePolicy.js";

export const ANDROID_STORE_URL = "https://play.google.com/store/apps/details?id=com.elexify";
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const iosStorePattern = /^https:\/\/apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[^/?#]+\/)?id\d+$/;

export const isVersion = value => versionPattern.test(value || "");
export const compareVersions = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};
export const validStoreUrl = (platform, url) =>
  platform === "android" ? url === ANDROID_STORE_URL : iosStorePattern.test(url || "");

// Environment-controlled release gate, used until an admin saves a policy.
// Invalid configuration never locks users out.
export function mobileUpdatePolicy(platform, env = process.env) {
  if (!["android", "ios"].includes(platform)) return null;
  const prefix = `MOBILE_${platform.toUpperCase()}`;
  const minimumVersion = env[`${prefix}_MIN_VERSION`] || "0.0.0";
  const storeUrl = platform === "android" ? ANDROID_STORE_URL : env.MOBILE_IOS_STORE_URL;
  const validVersion = isVersion(minimumVersion);
  const validStore = validStoreUrl(platform, storeUrl);
  const enabled = env[`${prefix}_UPDATE_ENABLED`] === "true";
  if (enabled && (!validVersion || !validStore)) throw new Error("Invalid mobile update policy");
  return { schemaVersion: 1, platform, enabled, minimumVersion: validVersion ? minimumVersion : "0.0.0", storeUrl: validStore ? storeUrl : null };
}

// Admin-managed policy (schema 2). Falls back to the environment policy.
export async function resolveUpdatePolicy(platform, env = process.env) {
  if (!["android", "ios"].includes(platform)) return null;
  const doc = await MobileUpdatePolicy.findOne({ platform }).lean();
  if (!doc) {
    const v1 = mobileUpdatePolicy(platform, env);
    return { ...v1, schemaVersion: 2, latestVersion: v1.minimumVersion, title: "", message: "", remindAfterHours: 24 };
  }
  const storeUrl = platform === "android" ? ANDROID_STORE_URL : doc.store_url;
  const usable = isVersion(doc.minimum_version) && isVersion(doc.latest_version) && validStoreUrl(platform, storeUrl);
  return {
    schemaVersion: 2,
    platform,
    enabled: doc.enabled && usable,
    minimumVersion: usable ? doc.minimum_version : "0.0.0",
    latestVersion: usable ? doc.latest_version : "0.0.0",
    storeUrl: validStoreUrl(platform, storeUrl) ? storeUrl : null,
    title: doc.title || "",
    message: doc.message || "",
    remindAfterHours: doc.remind_after_hours ?? 24,
  };
}

// Builds released before schema 2 understand only { enabled, minimumVersion }
// as a forced update, so they keep receiving that shape.
const toV1 = p => ({ schemaVersion: 1, platform: p.platform, enabled: p.enabled, minimumVersion: p.minimumVersion, storeUrl: p.storeUrl });

export async function getMobileUpdatePolicy(req, res) {
  res.set("Cache-Control", "no-store");
  try {
    const policy = await resolveUpdatePolicy(req.query.platform);
    if (!policy) return res.status(400).json({ message: "Invalid platform" });
    return res.json(req.query.schema === "2" ? policy : toV1(policy));
  } catch {
    return res.status(503).json({ message: "Update policy temporarily unavailable" });
  }
}
