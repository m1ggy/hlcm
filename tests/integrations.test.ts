import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import {
  clearIntegrationCache,
  deleteIntegration,
  getIntegration,
  getIntegrationStatus,
  isIntegrationConfigured,
  saveIntegration,
} from "@/lib/integrations";

// Per-org third-party credentials (Phase 4).

const A = { id: "org_int_a", slug: "int-a" };
const B = { id: "org_int_b", slug: "int-b" };
const CTK = { id: "org_ctk", slug: "ctk" };

beforeAll(async () => {
  for (const org of [A, B]) {
    await prisma.organization.upsert({ where: { id: org.id }, create: { ...org, name: org.slug }, update: {} });
  }
});

afterEach(() => {
  clearIntegrationCache();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("secrets", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("sk_live_123");
    const b = encryptSecret("sk_live_123");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(decryptSecret(a)).toBe("sk_live_123");
  });

  it("rejects a tampered value", () => {
    const [v, iv, tag, data] = encryptSecret("sk_live_123").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });
});

describe("per-org integrations", () => {
  it("each org has its own credentials", async () => {
    await runAsTenant(A, () => saveIntegration("STRIPE", { secretKey: "sk_a", webhookSecret: "whsec_a", taxEnabled: "true" }));
    await runAsTenant(B, () => saveIntegration("STRIPE", { secretKey: "sk_b" }));
    expect(await runAsTenant(A, () => getIntegration("STRIPE"))).toEqual({ secretKey: "sk_a", webhookSecret: "whsec_a", taxEnabled: "true" });
    expect(await runAsTenant(B, () => getIntegration("STRIPE"))).toEqual({ secretKey: "sk_b", taxEnabled: "false" });
  });

  it("stores secrets encrypted, never in plaintext", async () => {
    const row = await prisma.organizationIntegration.findFirst({ where: { organizationId: A.id, provider: "STRIPE" } });
    expect(row?.secrets).toMatch(/^v1:/);
    expect(row?.secrets).not.toContain("sk_a");
    expect(JSON.stringify(row?.config)).not.toContain("sk_a");
  });

  it("status exposes config and which secrets are set, never secret values", async () => {
    const status = await runAsTenant(A, () => getIntegrationStatus("STRIPE"));
    expect(status).toEqual({ provider: "STRIPE", source: "db", configured: true, config: { taxEnabled: "true" }, secretsSet: ["secretKey", "webhookSecret"] });
  });

  it("a blank secret keeps the stored one; clearSecrets removes it", async () => {
    await runAsTenant(A, () => saveIntegration("STRIPE", { secretKey: "", taxEnabled: "false" }));
    clearIntegrationCache();
    expect((await runAsTenant(A, () => getIntegration("STRIPE")))?.secretKey).toBe("sk_a");
    await runAsTenant(A, () => saveIntegration("STRIPE", {}, { clearSecrets: ["webhookSecret"] }));
    expect((await runAsTenant(A, () => getIntegration("STRIPE")))?.webhookSecret).toBeUndefined();
  });

  it("rejects a save missing required fields", async () => {
    await expect(runAsTenant(B, () => saveIntegration("TWILIO", { accountSid: "AC1" }))).rejects.toThrow(/Auth token, From number are required/);
    expect(await runAsTenant(B, () => isIntegrationConfigured("TWILIO"))).toBe(false);
  });

  it("fills defaults (DocuSign auth server)", async () => {
    await runAsTenant(B, () =>
      saveIntegration("DOCUSIGN", { integrationKey: "ik", userId: "u", accountId: "acc", privateKey: "cGVt" })
    );
    expect((await runAsTenant(B, () => getIntegration("DOCUSIGN")))?.authServer).toBe("account-d.docusign.com");
  });
});

describe("legacy env fallback", () => {
  it("only the legacy org (ctk) reads env credentials", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_env";
    expect((await runAsTenant(CTK, () => getIntegration("STRIPE")))?.secretKey).toBe("sk_env");
    expect((await runAsTenant(CTK, () => getIntegrationStatus("STRIPE"))).source).toBe("env");
    expect(await runAsTenant(A, () => getIntegration("CALENDLY"))).toBeNull();
  });

  it("a saved row wins, and the first save carries env secrets over", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_env";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_env";
    await runAsTenant(CTK, () => saveIntegration("STRIPE", { taxEnabled: "true" }));
    delete process.env.STRIPE_SECRET_KEY;
    clearIntegrationCache();
    expect(await runAsTenant(CTK, () => getIntegration("STRIPE"))).toEqual({ secretKey: "sk_env", webhookSecret: "whsec_env", taxEnabled: "true" });
    await runAsTenant(CTK, () => deleteIntegration("STRIPE"));
  });
});
