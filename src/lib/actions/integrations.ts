"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { getAppUrl } from "@/lib/email";
import { deleteIntegration, getIntegrationStatus, saveIntegration, type IntegrationStatus } from "@/lib/integrations";
import { INTEGRATION_PROVIDERS, type IntegrationProviderId } from "@/lib/integration-providers";
import { SecretsConfigError } from "@/lib/secrets";
import { testStripeConnection } from "@/lib/stripe";
import { testDocusignConnection } from "@/lib/docusign";
import { testCalendlyConnection } from "@/lib/calendly";
import { testWiseConnection } from "@/lib/wise";
import { testTwilioConnection } from "@/lib/twilio";
import { postTeamsMessage } from "@/lib/teams";

// Admin > Integrations: an organization connects its own Stripe, DocuSign,
// Calendly, Wise, Twilio and Teams accounts (src/lib/integrations.ts).
// Owners only — a Stripe key decides where clients' payments go, so this
// is deliberately narrower than the ADMIN gate most Admin pages use
// (requireRole lets OWNER/DEVELOPER through). Secret values never come back
// out of these actions; the audit log records that an integration changed,
// never what it changed to.

const OWNER_ONLY = ["OWNER"] as const;

function assertProvider(provider: string): IntegrationProviderId {
  if (!INTEGRATION_PROVIDERS.some((p) => p.id === provider)) throw new UserFacingError("Unknown integration");
  return provider as IntegrationProviderId;
}

export type AdminIntegration = IntegrationStatus & { webhookUrl: string | null };

export async function listIntegrationsForAdmin(): Promise<AdminIntegration[]> {
  await requireRole([...OWNER_ONLY]);
  const appUrl = await getAppUrl();
  return Promise.all(
    INTEGRATION_PROVIDERS.map(async (spec) => ({
      ...(await getIntegrationStatus(spec.id)),
      webhookUrl: spec.webhookPath ? `${appUrl}${spec.webhookPath}` : null,
    }))
  );
}

export async function saveIntegrationSettings(
  provider: string,
  values: Record<string, string>,
  clearSecrets: string[] = []
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requireRole([...OWNER_ONLY]);
    const id = assertProvider(provider);
    try {
      await saveIntegration(id, values, { clearSecrets });
    } catch (error) {
      // The server has no encryption key yet — nothing a form fix can solve.
      if (error instanceof SecretsConfigError) {
        throw new UserFacingError("This server isn't set up to store credentials yet (INTEGRATION_ENCRYPTION_KEY is missing) — contact support.");
      }
      throw error;
    }
    await recordAudit({ entityType: "Integration", entityId: id, action: "update_integration", actorId: session.user.id, newValue: id });
    revalidatePath("/admin/integrations");
  });
}

export async function disconnectIntegration(provider: string): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const session = await requireRole([...OWNER_ONLY]);
    const id = assertProvider(provider);
    await deleteIntegration(id);
    await recordAudit({ entityType: "Integration", entityId: id, action: "disconnect_integration", actorId: session.user.id, oldValue: id });
    revalidatePath("/admin/integrations");
  });
}

const TESTS: Record<IntegrationProviderId, () => Promise<string>> = {
  STRIPE: testStripeConnection,
  DOCUSIGN: testDocusignConnection,
  CALENDLY: testCalendlyConnection,
  WISE: testWiseConnection,
  TWILIO: testTwilioConnection,
  TEAMS: async () => {
    await postTeamsMessage("Test message from HCLM — your Teams connection works.");
    return "Posted a test message to the Teams channel";
  },
};

/**
 * One cheap live call with the saved credentials (Teams: posts a test
 * message). Any provider error comes back as the message — it's the
 * provider's own explanation of what's wrong with the credentials.
 */
export async function testIntegration(provider: string): Promise<ActionResult<string>> {
  return toActionResult(async () => {
    await requireRole([...OWNER_ONLY]);
    const id = assertProvider(provider);
    try {
      return await TESTS[id]();
    } catch (error) {
      const label = INTEGRATION_PROVIDERS.find((p) => p.id === id)!.label;
      // fetch() rejects with a bare "fetch failed" for DNS/network errors.
      if (error instanceof TypeError && error.message === "fetch failed") {
        throw new UserFacingError(`Couldn't reach ${label} — check the URL and that it's reachable from the server.`);
      }
      throw new UserFacingError(error instanceof Error ? error.message : "Connection test failed");
    }
  });
}
