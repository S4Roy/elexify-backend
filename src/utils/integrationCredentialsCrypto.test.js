import { afterEach, describe, expect, it } from "vitest";
import { envs } from "../config/index.js";
import { assertCredentialEncryptionConfigured, decryptCredential, encryptCredential, maskCredential } from "./integrationCredentialsCrypto.js";

const originalKey = envs.integrationCredentials.encryptionKey;
afterEach(() => { envs.integrationCredentials.encryptionKey = originalKey; });

describe("integration credential encryption", () => {
  it("round-trips with authenticated encryption and random nonces", () => {
    envs.integrationCredentials.encryptionKey = "test-only-key-material";
    const first = encryptCredential("client-secret");
    const second = encryptCredential("client-secret");
    expect(first).not.toBe(second);
    expect(first).not.toContain("client-secret");
    expect(decryptCredential(first)).toBe("client-secret");
  });

  it("fails closed when no encryption key is configured", () => {
    envs.integrationCredentials.encryptionKey = "";
    expect(() => encryptCredential("secret")).toThrow(/ENCRYPTION_KEY/);
    expect(() => assertCredentialEncryptionConfigured()).toThrow(/ENCRYPTION_KEY/);
  });

  it("masks values without returning the complete credential", () => {
    expect(maskCredential("merchant-secret-1234")).toBe("mer••••1234");
    expect(maskCredential("admin@example.com")).toBe("ad***@example.com");
  });
});
