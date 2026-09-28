import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { sendEmail } from "@/lib/email";

// Who a workspace's email is from: the platform's own verified address, under
// the organization's name, with replies to the org's reply-to address.
// fetch is stubbed — nothing is sent.

const ORG = { id: "org_mail", slug: "mail-co" };
let sent: Record<string, unknown>[] = [];

beforeAll(async () => {
  await prisma.organization.upsert({
    where: { id: ORG.id },
    create: { ...ORG, name: 'Sunrise "Home" Care', replyToEmail: "billing@sunrise.test" },
    update: {},
  });
  forgetOrg(ORG.slug);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sent = [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

function stubResend() {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "HCLM Notifications <notifications@platform.test>");
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  });
}

describe("sendEmail sender", () => {
  it("sends as the organization, from the platform address, replying to the org", async () => {
    stubResend();
    await runAsTenant(ORG, () => sendEmail({ to: "client@example.test", subject: "Invoice", html: "<p>hi</p>" }));
    expect(sent[0]).toMatchObject({
      from: '"Sunrise Home Care" <notifications@platform.test>',
      reply_to: "billing@sunrise.test",
    });
  });

  it("uses EMAIL_FROM as-is outside any workspace", async () => {
    stubResend();
    await sendEmail({ to: "someone@example.test", subject: "Your workspaces", html: "<p>hi</p>" });
    expect(sent[0].from).toBe("HCLM Notifications <notifications@platform.test>");
    expect(sent[0].reply_to).toBeUndefined();
  });
});
