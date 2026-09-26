// Thin wrapper around DocuSign's eSignature REST API — same shape as
// src/lib/stripe.ts/src/lib/wise.ts/src/lib/teams.ts (lazy env getters, a
// *ConfigError/*ApiError pair, no SDK, plain fetch) — bigger than those
// because DocuSign needs OAuth (JWT Grant, this app's first OAuth-shaped
// integration — no other precedent in this codebase) and its own
// account-base-URI discovery (DocuSign accounts aren't on a fixed host).
// Server-only — never import from a client component. Credentials are the
// current organization's own DocuSign account (Admin > Integrations, via
// src/lib/integrations.ts); tokens are cached per organization.
//
// Auth: JWT Grant (server-to-server, no per-user consent screen at request
// time), signed with `jose` — already a dependency, same SignJWT API
// already used for HS256 in src/lib/mfa-challenge.ts, just RS256 +
// importPKCS8 here. A one-time interactive consent grant (a real browser
// visit) is still unavoidable before the FIRST token request ever
// succeeds — see the "DocuSign integration setup" section in README.md.
//
// Docs: https://developers.docusign.com/platform/auth/jwt/
//       https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/create/
//       https://developers.docusign.com/platform/webhooks/connect/

import crypto from "crypto";
import { SignJWT, importPKCS8 } from "jose";
import { currentOrgId } from "@/lib/db";
import { getIntegration } from "@/lib/integrations";

export class DocusignConfigError extends Error {}
export class DocusignApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}
export class DocusignWebhookError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function getConfig() {
  const values = await getIntegration("DOCUSIGN");
  const integrationKey = values?.integrationKey;
  const userId = values?.userId;
  const accountId = values?.accountId;
  const privateKeyB64 = values?.privateKey;
  if (!integrationKey || !userId || !accountId || !privateKeyB64) return null;
  const authServer = values?.authServer || "account-d.docusign.com";
  return { integrationKey, userId, accountId, privateKeyB64, authServer };
}

export async function isDocusignConfigured(): Promise<boolean> {
  return (await getConfig()) !== null;
}

async function requireConfig() {
  const config = await getConfig();
  if (!config) {
    throw new DocusignConfigError("DocuSign isn't connected for this workspace — set it up in Admin > Integrations");
  }
  return config;
}

// In-process caches, one entry per organization — "cache the short-lived
// token, refresh with a margin before it actually expires". Keyed by the
// credentials too, so saving new ones in Admin > Integrations takes effect
// immediately instead of serving the old account's token.
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();
const accountCache = new Map<string, { accountId: string; baseUri: string }>();

function cacheKey(orgId: string, config: { integrationKey: string; userId: string; accountId: string; authServer: string }) {
  return [orgId, config.integrationKey, config.userId, config.accountId, config.authServer].join("|");
}

export async function getAccessToken(): Promise<string> {
  const config = await requireConfig();
  const key = cacheKey(await currentOrgId(), config);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;

  // The private key is stored base64-encoded (of the raw PEM text) — survives
  // form/env newline handling far more reliably than a multi-line PEM.
  const pem = Buffer.from(config.privateKeyB64, "base64").toString("utf-8");
  const privateKey = await importPKCS8(pem, "RS256");

  const assertion = await new SignJWT({ scope: "signature impersonation" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(config.integrationKey)
    .setSubject(config.userId)
    .setAudience(config.authServer)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const res = await fetch(`https://${config.authServer}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new DocusignApiError(`DocuSign token request failed: ${res.status} ${body}`, res.status);
  }
  const data = await res.json();
  // expires_in is seconds (DocuSign: 3600) — cache with a 5-minute margin.
  tokenCache.set(key, { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 });
  return data.access_token;
}

export async function getAccountBaseUri(): Promise<{ accountId: string; baseUri: string }> {
  const config = await requireConfig();
  const key = cacheKey(await currentOrgId(), config);
  const cached = accountCache.get(key);
  if (cached) return cached;

  const accessToken = await getAccessToken();
  const res = await fetch(`https://${config.authServer}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new DocusignApiError(`DocuSign userinfo request failed: ${res.status} ${await res.text()}`, res.status);
  }
  const data = await res.json();
  const account = (data.accounts as { account_id: string; base_uri: string }[])?.find(
    (a) => a.account_id === config.accountId
  );
  if (!account) throw new DocusignConfigError(`DocuSign account ID ${config.accountId} not found for this user`);

  const entry = { accountId: account.account_id, baseUri: account.base_uri };
  accountCache.set(key, entry);
  return entry;
}

async function docusignFetch(path: string, init: RequestInit) {
  const accessToken = await getAccessToken();
  const { accountId, baseUri } = await getAccountBaseUri();
  const res = await fetch(`${baseUri}/restapi/v2.1/accounts/${accountId}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new DocusignApiError(`DocuSign API request failed: ${res.status} ${body}`, res.status);
  }
  return res;
}

export async function createEnvelope(input: {
  documentBuffer: Buffer;
  documentName: string;
  signerName: string;
  signerEmail: string;
  pageNumber: number;
  xPosition: number;
  yPosition: number;
  expirationDays?: number;
}): Promise<{ envelopeId: string; status: string }> {
  const res = await docusignFetch("/envelopes", {
    method: "POST",
    body: JSON.stringify({
      emailSubject: `Please sign: ${input.documentName}`,
      documents: [
        {
          documentBase64: input.documentBuffer.toString("base64"),
          name: input.documentName,
          fileExtension: "pdf",
          documentId: "1",
        },
      ],
      recipients: {
        signers: [
          {
            email: input.signerEmail,
            name: input.signerName,
            recipientId: "1",
            routingOrder: "1",
            tabs: {
              signHereTabs: [
                {
                  documentId: "1",
                  pageNumber: String(input.pageNumber),
                  xPosition: String(input.xPosition),
                  yPosition: String(input.yPosition),
                },
              ],
            },
          },
        ],
      },
      status: "sent",
      notification: {
        expirations: {
          expireEnabled: "true",
          expireAfter: String(input.expirationDays ?? 30),
          expireWarn: "0",
        },
      },
    }),
  });
  const data = await res.json();
  return { envelopeId: data.envelopeId, status: data.status };
}

export async function getEnvelopeStatus(envelopeId: string): Promise<{ status: string }> {
  const res = await docusignFetch(`/envelopes/${envelopeId}`, { method: "GET" });
  const data = await res.json();
  return { status: data.status };
}

export async function voidEnvelope(envelopeId: string, reason: string): Promise<void> {
  await docusignFetch(`/envelopes/${envelopeId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "voided", voidedReason: reason }),
  });
}

export async function downloadCompletedDocument(envelopeId: string): Promise<Buffer> {
  const accessToken = await getAccessToken();
  const { accountId, baseUri } = await getAccountBaseUri();
  const res = await fetch(
    `${baseUri}/restapi/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new DocusignApiError(`DocuSign document download failed: ${res.status} ${await res.text()}`, res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}

export type DocusignConnectPayload = {
  event: string;
  data: { envelopeId: string; envelopeSummary?: { status?: string } };
};

// DocuSign Connect signs each delivery with HMAC-SHA256, base64-encoded (not
// hex, unlike Stripe/Calendly's schemes), in an "X-DocuSign-Signature-1"
// header (numbered — up to 5 configured HMAC keys, "-1" through "-5"; this
// checks only the first, since the setup runbook configures exactly one).
// Confirm this exact header name against a real Connect delivery once
// configured — DocuSign's docs are the source of truth, not memory. Unlike
// Calendly's t=...,v1=... scheme, there's no timestamp component here, so
// no replay-window check is possible at this layer.
export async function verifyDocusignWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<DocusignConnectPayload> {
  const key = (await getIntegration("DOCUSIGN"))?.webhookHmacKey;
  if (!key) throw new DocusignConfigError("DocuSign Connect HMAC key isn't set for this workspace (Admin > Integrations)");
  if (!signatureHeader) throw new DocusignWebhookError("Missing X-DocuSign-Signature-1 header", 400);

  const computed = crypto.createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new DocusignWebhookError("Signature verification failed", 400);
  }

  return JSON.parse(rawBody);
}

/** Token + account lookup — used by Admin > Integrations' "Test connection". */
export async function testDocusignConnection(): Promise<string> {
  const { accountId } = await getAccountBaseUri();
  return `Connected to DocuSign account ${accountId}`;
}
