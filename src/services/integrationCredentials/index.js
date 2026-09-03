import IntegrationCredential from "../../models/IntegrationCredential.js";
import { decryptCredential } from "../../utils/integrationCredentialsCrypto.js";

export const getIntegrationConfig = async (provider, fallback = {}) => {
  const doc = await IntegrationCredential.findOne({ provider }).select("+credentials");
  if (!doc) return fallback;
  if (!doc.enabled) return null;
  const managed = Object.fromEntries(
    [...(doc.credentials || new Map()).entries()].map(([key, value]) => [key, decryptCredential(value)]),
  );
  return { ...fallback, ...managed };
};
