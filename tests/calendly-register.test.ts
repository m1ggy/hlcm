import crypto from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { clearIntegrationCache, getIntegration, patchIntegration, saveIntegration } from "@/lib/integrations";
import { registerCalendlyWebhook, verifyCalendlyWebhookSignature } from "@/lib/calendly";

// "Register webhook" for Calendly (a tenant can't do this step by hand):
// only this workspace's old subscription is replaced, and the generated key
// is what verifies later deliveries. Calendly's API is stubbed.

const ORG = { id: "org_cal_reg", slug: "cal-reg" };
const CALLBACK = "https://cal-reg.example.test/api/webhooks/calendly";
const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];

beforeAll(async () => {
  await prisma.organization.upsert({ where: { id: ORG.id }, create: { ...ORG, name: "Cal" }, update: {} });
  await runAsTenant(ORG, () => saveIntegration("CALENDLY", { apiToken: "pat_123" }));
});

afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await prisma.$disconnect();
});

function stubCalendly() {
  vi.stubGlobal("fetch", async (url: string, init: { method?: string; body?: string; headers?: Record<string, string> }) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, body: init.body ? JSON.parse(init.body) : undefined });
    expect(init.headers?.Authorization).toBe("Bearer pat_123");
    if (url.endsWith("/users/me")) return Response.json({ resource: { current_organization: "https://api.calendly.com/organizations/ORG1" } });
    if (url.includes("/webhook_subscriptions?")) {
      return Response.json({
        collection: [
          { uri: "https://api.calendly.com/webhook_subscriptions/OURS", callback_url: CALLBACK },
          { uri: "https://api.calendly.com/webhook_subscriptions/THEIRS", callback_url: "https://zapier.example/hook" },
        ],
      });
    }
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (method === "POST") return Response.json({ resource: { callback_url: CALLBACK } }, { status: 201 });
    return new Response("unexpected", { status: 500 });
  });
}

describe("registerCalendlyWebhook", () => {
  it("replaces only this workspace's subscription and stores a key that verifies deliveries", async () => {
    stubCalendly();
    const key = await runAsTenant(ORG, async () => {
      const k = await registerCalendlyWebhook(CALLBACK);
      await patchIntegration("CALENDLY", { webhookSigningKey: k });
      return k;
    });

    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url)).toEqual(["https://api.calendly.com/webhook_subscriptions/OURS"]);
    const created = calls.find((c) => c.method === "POST")!;
    expect(created.body).toMatchObject({ url: CALLBACK, scope: "organization", signing_key: key, events: ["invitee.created", "invitee.canceled"] });

    clearIntegrationCache();
    const stored = await runAsTenant(ORG, () => getIntegration("CALENDLY"));
    expect(stored).toMatchObject({ apiToken: "pat_123", webhookSigningKey: key });

    vi.unstubAllGlobals();
    const body = JSON.stringify({ event: "invitee.created", payload: {} });
    const t = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", key).update(`${t}.${body}`).digest("hex");
    await expect(runAsTenant(ORG, () => verifyCalendlyWebhookSignature(body, `t=${t},v1=${sig}`))).resolves.toMatchObject({ event: "invitee.created" });
  });
});
