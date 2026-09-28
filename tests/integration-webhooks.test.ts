import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { clearIntegrationCache, saveIntegration } from "@/lib/integrations";
import { verifyWebhookSignature } from "@/lib/stripe";
import { verifyCalendlyWebhookSignature } from "@/lib/calendly";
import { verifyDocusignWebhookSignature } from "@/lib/docusign";

// A webhook is verified with the signing secret of the org it was sent to —
// one tenant's secret never validates another tenant's deliveries.

const A = { id: "org_wh_a", slug: "wh-a" };
const B = { id: "org_wh_b", slug: "wh-b" };
const body = JSON.stringify({ type: "invoice.paid", event: "invitee.created", data: { object: {} }, payload: {} });

function hexSig(secret: string, t: number) {
  return crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
}

beforeAll(async () => {
  for (const org of [A, B]) {
    await prisma.organization.upsert({ where: { id: org.id }, create: { ...org, name: org.slug }, update: {} });
  }
  await runAsTenant(A, async () => {
    await saveIntegration("STRIPE", { secretKey: "sk_a", webhookSecret: "whsec_a" });
    await saveIntegration("CALENDLY", { webhookSigningKey: "cal_a" });
    await saveIntegration("DOCUSIGN", { integrationKey: "ik", userId: "u", accountId: "acc", privateKey: "cGVt", webhookHmacKey: "ds_a" });
  });
  await runAsTenant(B, () => saveIntegration("STRIPE", { secretKey: "sk_b", webhookSecret: "whsec_b" }));
  clearIntegrationCache();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("per-org webhook verification", () => {
  it("Stripe: A's delivery verifies at A, not at B", async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v1=${hexSig("whsec_a", t)}`;
    await expect(runAsTenant(A, () => verifyWebhookSignature(body, header))).resolves.toMatchObject({ type: "invoice.paid" });
    await expect(runAsTenant(B, () => verifyWebhookSignature(body, header))).rejects.toThrow("Signature verification failed");
  });

  it("Calendly: verified with A's signing key; B has none configured", async () => {
    const t = Math.floor(Date.now() / 1000);
    const header = `t=${t},v1=${hexSig("cal_a", t)}`;
    await expect(runAsTenant(A, () => verifyCalendlyWebhookSignature(body, header))).resolves.toMatchObject({ event: "invitee.created" });
    await expect(runAsTenant(B, () => verifyCalendlyWebhookSignature(body, header))).rejects.toThrow(/signing key isn't set/);
  });

  it("DocuSign: verified with A's HMAC key only", async () => {
    const header = crypto.createHmac("sha256", "ds_a").update(body, "utf8").digest("base64");
    await expect(runAsTenant(A, () => verifyDocusignWebhookSignature(body, header))).resolves.toBeTruthy();
    await expect(runAsTenant(B, () => verifyDocusignWebhookSignature(body, header))).rejects.toThrow(/HMAC key isn't set/);
  });
});
