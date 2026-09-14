// Thin wrapper around DocuSign's eSignature REST API — same shape as
// src/lib/stripe.ts/src/lib/wise.ts/src/lib/teams.ts (lazy env getters, a
// *ConfigError/*ApiError pair, no SDK, plain fetch) — bigger than those
// because DocuSign needs OAuth (JWT Grant, this app's first OAuth-shaped
// integration — no other precedent in this codebase) and its own
// account-base-URI discovery (DocuSign accounts aren't on a fixed host).
// Server-only — never import from a client component.
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

function getConfig() {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId = process.env.DOCUSIGN_USER_ID;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const privateKeyB64 = process.env.DOCUSIGN_PRIVATE_KEY;
  if (!integrationKey || !userId || !accountId || !privateKeyB64) return null;
  const authServer = process.env.DOCUSIGN_AUTH_SERVER || "account-d.docusign.com";
  return { integrationKey, userId, accountId, privateKeyB64, authServer };
}

export function isDocusignConfigured(): boolean {
  return getConfig() !== null;
}

function requireConfig() {
  const config = getConfig();
  if (!config) {
    throw new DocusignConfigError(
      "DOCUSIGN_INTEGRATION_KEY/DOCUSIGN_USER_ID/DOCUSIGN_ACCOUNT_ID/DOCUSIGN_PRIVATE_KEY env vars are required"
    );
  }
  return config;
}

// In-process cache — same "cache the short-lived token, refresh with a
// margin before it actually expires" shape this file would use regardless
// of framework; nothing Next-specific about it.
let tokenCache: { accessToken: string; expiresAt: number } | null = null;
let accountCache: { accountId: string; baseUri: string; authServer: string } | null = null;

export async function getAccessToken(): Promise<string> {
  const config = requireConfig();
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.accessToken;

  // DOCUSIGN_PRIVATE_KEY is base64-encoded (of the raw PEM text) — survives
  // .env parsing/newline handling far more reliably than a multi-line PEM
  // pasted directly into an env var.
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
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in - 300) * 1000 };
  return tokenCache.accessToken;
}

export async function getAccountBaseUri(): Promise<{ accountId: string; baseUri: string }> {
  const config = requireConfig();
  if (accountCache && accountCache.authServer === config.authServer) return accountCache;

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
  if (!account) throw new DocusignConfigError(`DOCUSIGN_ACCOUNT_ID ${config.accountId} not found for this user`);

  accountCache = { accountId: account.account_id, baseUri: account.base_uri, authServer: config.authServer };
  return accountCache;
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
export function verifyDocusignWebhookSignature(rawBody: string, signatureHeader: string | null): DocusignConnectPayload {
  const key = process.env.DOCUSIGN_WEBHOOK_HMAC_KEY;
  if (!key) throw new DocusignConfigError("DOCUSIGN_WEBHOOK_HMAC_KEY env var is required");
  if (!signatureHeader) throw new DocusignWebhookError("Missing X-DocuSign-Signature-1 header", 400);

  const computed = crypto.createHmac("sha256", key).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new DocusignWebhookError("Signature verification failed", 400);
  }

  return JSON.parse(rawBody);
}
