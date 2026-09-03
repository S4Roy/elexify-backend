import crypto from "node:crypto";
import { envs } from "../config/index.js";

const PREFIX = "enc:v1";

const encryptionKey = () => {
  const raw = envs.integrationCredentials?.encryptionKey;
  if (!raw) throw new Error("INTEGRATION_CREDENTIALS_ENCRYPTION_KEY is not configured");
  // Accept a 32-byte base64 key, or derive a stable 256-bit key from a passphrase.
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32
    ? decoded
    : crypto.createHash("sha256").update(`elexify:integration-credentials:v1:${raw}`).digest();
};

export const assertCredentialEncryptionConfigured = () => {
  encryptionKey();
  return true;
};

export const encryptCredential = (value) => {
  if (value == null || value === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
};

export const decryptCredential = (value) => {
  if (!value) return null;
  if (!String(value).startsWith(`${PREFIX}:`)) return value; // legacy rollout compatibility
  const [, , iv, tag, payload] = String(value).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8");
};

export const maskCredential = (value) => {
  if (!value) return null;
  const plain = String(value);
  if (plain.includes("@")) {
    const [name, domain] = plain.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return plain.length <= 8 ? "••••••••" : `${plain.slice(0, 3)}••••${plain.slice(-4)}`;
};
