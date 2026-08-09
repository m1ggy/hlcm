// Thin wrapper around Wise's Transfer API. Server-only — never import this
// from a client component, the API token would end up in the bundle.
//
// Docs: https://docs.wise.com/api-docs/api-reference
// Sandbox: https://sandbox.transferwise.tech (separate account from wise.com,
// no KYC needed — see the "Wise sandbox setup" note in the payout UI).

const API_BASE = process.env.WISE_API_BASE ?? "https://api.sandbox.transferwise.tech";

export class WiseConfigError extends Error {}
export class WiseApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
  }
}

function getToken() {
  const token = process.env.WISE_API_TOKEN;
  if (!token) throw new WiseConfigError("WISE_API_TOKEN env var is required");
  return token;
}

export function getWiseProfileId() {
  const profileId = process.env.WISE_PROFILE_ID;
  if (!profileId) throw new WiseConfigError("WISE_PROFILE_ID env var is required");
  return profileId;
}

async function wiseFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      body?.errors?.map((e: { message?: string }) => e.message).join("; ") ??
      body?.message ??
      `Wise API returned ${res.status}`;
    throw new WiseApiError(message, res.status, body);
  }
  return body as T;
}

// --- Dynamic recipient requirements -----------------------------------
// Every currency needs different fields (US wants routing+account number,
// India wants an IFSC code, Pakistan wants an IBAN, ...) — rather than
// hardcode a field set per country, we ask Wise what it needs and render
// whatever comes back. `source`/`target` are both currency codes; Wise
// returns options that vary slightly with the transfer amount so a
// representative amount is passed even though the real quote comes later.
export type WiseRequirementField = {
  key: string;
  name: string;
  type: string;
  required: boolean;
  example: string;
  minLength: number | null;
  maxLength: number | null;
  validationRegexp: string | null;
  valuesAllowed: { key: string; name: string }[] | null;
};

export type WiseRequirementType = {
  type: string;
  title: string;
  fields: { name: string; group: WiseRequirementField[] }[];
};

export async function getAccountRequirements(params: {
  source: string;
  target: string;
  sourceAmount?: number;
}) {
  const search = new URLSearchParams({
    source: params.source,
    target: params.target,
    sourceAmount: String(params.sourceAmount ?? 100),
  });
  return wiseFetch<WiseRequirementType[]>(`/v1/account-requirements?${search.toString()}`);
}

// --- Recipient accounts --------------------------------------------------
export async function createRecipientAccount(params: {
  currency: string;
  type: string;
  accountHolderName: string;
  legalType: "PRIVATE" | "BUSINESS";
  details: Record<string, unknown>;
}) {
  return wiseFetch<{ id: number }>("/v1/accounts", {
    method: "POST",
    body: JSON.stringify({
      currency: params.currency,
      type: params.type,
      profile: getWiseProfileId(),
      accountHolderName: params.accountHolderName,
      legalType: params.legalType,
      details: params.details,
    }),
  });
}

// --- Quotes + transfers ---------------------------------------------------
export async function createQuote(params: {
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
}) {
  return wiseFetch<{
    id: string;
    rate: number;
    sourceAmount: number;
    targetAmount: number;
    targetCurrency: string;
  }>(`/v3/profiles/${getWiseProfileId()}/quotes`, {
    method: "POST",
    body: JSON.stringify({
      sourceCurrency: params.sourceCurrency,
      targetCurrency: params.targetCurrency,
      sourceAmount: params.sourceAmount,
      payOut: "BANK_TRANSFER",
    }),
  });
}

export async function createTransfer(params: {
  targetAccountId: string;
  quoteId: string;
  reference: string;
}) {
  return wiseFetch<{ id: number; status: string }>("/v1/transfers", {
    method: "POST",
    body: JSON.stringify({
      targetAccount: Number(params.targetAccountId),
      quoteUuid: params.quoteId,
      customerTransactionId: crypto.randomUUID(),
      details: { reference: params.reference.slice(0, 30) },
    }),
  });
}

/** Pays a transfer out of the Wise account balance. Requires the profile to actually hold that currency — fails with a clear error otherwise. */
export async function fundTransfer(transferId: number) {
  return wiseFetch<{ status: string; errorCode: string | null }>(
    `/v3/profiles/${getWiseProfileId()}/transfers/${transferId}/payments`,
    { method: "POST", body: JSON.stringify({ type: "BALANCE" }) }
  );
}

/**
 * Sandbox-only: a real transfer moves through processing states as Wise's
 * banking partners clear it, which never happens on its own in sandbox.
 * These simulation endpoints fast-forward it to completed so the flow can
 * be tested end-to-end. No-ops (and safely ignorable) against production.
 */
export async function simulateTransferCompletion(transferId: number) {
  for (const stage of ["processing", "funds_converted", "outgoing_payment_sent"]) {
    try {
      await wiseFetch(`/v1/simulation/transfers/${transferId}/${stage}`, { method: "GET" });
    } catch {
      // Sandbox simulation steps are order- and state-dependent — a step
      // that doesn't apply yet is expected, not fatal to the payout.
    }
  }
}
