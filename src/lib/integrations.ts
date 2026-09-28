import { currentOrg, db } from "@/lib/db";
import { decryptSecretMap, encryptSecretMap } from "@/lib/secrets";
import { providerSpec, type IntegrationProviderId } from "@/lib/integration-providers";
import { UserFacingError } from "@/lib/user-facing-error";

// The current organization's credentials for a third-party service
// (docs/multitenancy-plan.md, Phase 4). Every integration module
// (src/lib/stripe.ts, docusign.ts, …) reads its settings here instead of
// process.env, so each tenant's Stripe calls use that tenant's Stripe key.
//
// Legacy fallback: the org that ran on env vars before this existed (CTK —
// LEGACY_INTEGRATIONS_ORG_SLUG, default "ctk") keeps using them until an
// admin saves that integration in Admin > Integrations; a saved row always
// wins. No other org ever sees the env credentials. Once CTK's are saved,
// the env vars can be removed.

export type IntegrationValues = Record<string, string>;

function legacyOrgSlug() {
  return process.env.LEGACY_INTEGRATIONS_ORG_SLUG ?? "ctk";
}

// Short per-process cache: integrations are read on every Stripe/DocuSign
// call and change rarely. Saves clear the entry immediately; another app
// process (there's one today) would see a change within the TTL.
const CACHE_TTL_MS = 30_000;
// On globalThis for the same reason as the org cache in src/lib/tenant.ts: a
// save in a Server Action must invalidate what the next page render reads.
type CacheEntry = { value: IntegrationValues | null; source: "db" | "env" | null; expiresAt: number };
const globalForIntegrations = globalThis as unknown as { __hclmIntegrationCache?: Map<string, CacheEntry> };
const cache = (globalForIntegrations.__hclmIntegrationCache ??= new Map<string, CacheEntry>());

function withDefaults(provider: IntegrationProviderId, values: IntegrationValues): IntegrationValues {
  const out = { ...values };
  for (const field of providerSpec(provider).fields) {
    if (!out[field.key] && field.defaultValue !== undefined) out[field.key] = field.defaultValue;
  }
  return out;
}

function isComplete(provider: IntegrationProviderId, values: IntegrationValues) {
  return providerSpec(provider).fields.every((f) => !f.required || Boolean(values[f.key]));
}

function fromEnv(provider: IntegrationProviderId): IntegrationValues | null {
  const values: IntegrationValues = {};
  for (const field of providerSpec(provider).fields) {
    const v = field.env ? process.env[field.env] : undefined;
    if (v) values[field.key] = v;
  }
  if (provider === "CALENDLY" && !values.bookingUrl && Object.keys(values).length > 0) {
    // CTK's public booking page, hardcoded before per-org integrations.
    values.bookingUrl = "https://calendly.com/ctkadvisorsinc";
  }
  return Object.keys(values).length > 0 ? values : null;
}

async function load(provider: IntegrationProviderId) {
  const org = await currentOrg();
  const key = `${org.id}:${provider}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit;

  const row = await db.organizationIntegration.findUnique({ where: { organizationId_provider: { organizationId: org.id, provider } } });
  let entry: CacheEntry;
  if (row) {
    const config = (row.config ?? {}) as IntegrationValues;
    entry = { value: withDefaults(provider, { ...config, ...decryptSecretMap(row.secrets) }), source: "db", expiresAt: Date.now() + CACHE_TTL_MS };
  } else {
    const env = org.slug === legacyOrgSlug() ? fromEnv(provider) : null;
    entry = { value: env ? withDefaults(provider, env) : null, source: env ? "env" : null, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  cache.set(key, entry);
  return entry;
}

/**
 * The current org's settings for `provider` (config and decrypted secrets
 * merged, defaults filled), or null if it hasn't connected one. Callers
 * check the specific fields they need — a Calendly connection may have a
 * booking URL but no API token, for instance.
 */
export async function getIntegration(provider: IntegrationProviderId): Promise<IntegrationValues | null> {
  return (await load(provider)).value;
}

/** Whether every required field for `provider` is set for the current org. */
export async function isIntegrationConfigured(provider: IntegrationProviderId): Promise<boolean> {
  const values = await getIntegration(provider);
  return values !== null && isComplete(provider, values);
}

export type IntegrationStatus = {
  provider: IntegrationProviderId;
  source: "db" | "env" | null;
  configured: boolean;
  /** Non-secret values, for pre-filling the admin form. */
  config: IntegrationValues;
  /** Which secret fields have a value (their values never leave the server). */
  secretsSet: string[];
};

export async function getIntegrationStatus(provider: IntegrationProviderId): Promise<IntegrationStatus> {
  const { value, source } = await load(provider);
  const spec = providerSpec(provider);
  const values = value ?? {};
  return {
    provider,
    source,
    configured: value !== null && isComplete(provider, values),
    config: Object.fromEntries(spec.fields.filter((f) => !f.secret && values[f.key] !== undefined).map((f) => [f.key, values[f.key]])),
    secretsSet: spec.fields.filter((f) => f.secret && Boolean(values[f.key])).map((f) => f.key),
  };
}

/**
 * Saves the current org's settings for `provider`. A secret field left blank
 * keeps its stored value (the form never shows secrets, so blank means
 * "unchanged"); `clearSecrets` explicitly removes some. Non-secret fields are
 * replaced as given. The first save of the legacy org carries over any
 * secrets it was reading from env, so saving just a new account id doesn't
 * silently drop the env-provided key.
 */
export async function saveIntegration(
  provider: IntegrationProviderId,
  input: IntegrationValues,
  options: { clearSecrets?: string[] } = {}
) {
  const org = await currentOrg();
  const spec = providerSpec(provider);
  const current = await load(provider);
  const previous = current.value ?? {};

  const config: IntegrationValues = {};
  const secrets: IntegrationValues = {};
  for (const field of spec.fields) {
    const raw = (input[field.key] ?? "").trim();
    if (field.secret) {
      const kept = options.clearSecrets?.includes(field.key) ? "" : previous[field.key] ?? "";
      const value = raw || kept;
      if (value) secrets[field.key] = value;
    } else if (field.kind === "boolean") {
      config[field.key] = raw === "true" ? "true" : "false";
    } else if (raw) {
      config[field.key] = raw;
    }
  }

  const missing = spec.fields.filter((f) => f.required && !(f.secret ? secrets[f.key] : config[f.key]) && f.defaultValue === undefined);
  if (missing.length > 0) {
    throw new UserFacingError(`${spec.label}: ${missing.map((f) => f.label).join(", ")} ${missing.length === 1 ? "is" : "are"} required`);
  }

  const encrypted = Object.keys(secrets).length > 0 ? encryptSecretMap(secrets) : null;
  await db.organizationIntegration.upsert({
    where: { organizationId_provider: { organizationId: org.id, provider } },
    create: { provider, config, secrets: encrypted },
    update: { config, secrets: encrypted },
  });
  cache.delete(`${org.id}:${provider}`);
}

/** Disconnects `provider` for the current org (the legacy org falls back to env again, if set). */
export async function deleteIntegration(provider: IntegrationProviderId) {
  const org = await currentOrg();
  await db.organizationIntegration.deleteMany({ where: { provider } });
  cache.delete(`${org.id}:${provider}`);
}

/** For tests: drop cached lookups. */
export function clearIntegrationCache() {
  cache.clear();
}
