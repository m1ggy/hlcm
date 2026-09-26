import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Encryption at rest for tenants' third-party credentials
// (OrganizationIntegration.secrets). AES-256-GCM with a random 12-byte IV
// per value; the auth tag makes tampering fail loudly instead of decrypting
// to garbage.
//
// Key: INTEGRATION_ENCRYPTION_KEY — 32 random bytes, base64
// (`openssl rand -base64 32`). It lives only in the server's env, never in
// the database, so a DB dump alone doesn't expose anyone's Stripe key.
// Losing it means every org re-enters its integration secrets.
//
// Format: "v1:<iv>:<tag>:<ciphertext>" (base64 parts). The version prefix
// leaves room to rotate keys later (decrypt with the old, re-encrypt with
// the new) without guessing which key a value was written with.

const VERSION = "v1";

export class SecretsConfigError extends Error {}

function getKey(): Buffer {
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) throw new SecretsConfigError("INTEGRATION_ENCRYPTION_KEY is not set — required to store integration credentials");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new SecretsConfigError("INTEGRATION_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, data] = value.split(":");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Unrecognized encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** A string→string map as one ciphertext (the shape OrganizationIntegration.secrets stores). */
export function encryptSecretMap(secrets: Record<string, string>): string {
  return encryptSecret(JSON.stringify(secrets));
}

export function decryptSecretMap(value: string | null): Record<string, string> {
  if (!value) return {};
  return JSON.parse(decryptSecret(value)) as Record<string, string>;
}
