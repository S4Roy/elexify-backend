import { envs } from "../config/index.js";
import { getIntegrationConfig } from "./integrationCredentials/index.js";

// Per-platform "Continue with Google" switches, managed in Admin →
// Integration Credentials → Google Sign-In. Lets an admin hide the button
// on a platform instantly (e.g. while its OAuth client is being fixed)
// without shipping a new app release.
export const GOOGLE_PLATFORMS = ["android", "ios", "web"];
export const GOOGLE_SIGNIN_DEFAULTS = { show_android: "true", show_ios: "true", show_web: "true" };

export const googleSignInPlatforms = async () => {
  const config = await getIntegrationConfig("google", { client_id: envs.google.clientId });
  const usable = !!config?.client_id;
  return Object.fromEntries(
    GOOGLE_PLATFORMS.map((p) => [p, usable && (config[`show_${p}`] ?? GOOGLE_SIGNIN_DEFAULTS[`show_${p}`]) !== "false"]),
  );
};

export const publicGoogleSignInConfig = async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json({ status: "success", data: { platforms: await googleSignInPlatforms() } });
  } catch {
    res.status(503).json({ status: "error", message: "Sign-in configuration is unavailable. Please try again." });
  }
};
