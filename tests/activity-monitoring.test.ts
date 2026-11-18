import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.AUTH_SECRET ??= "test-secret-for-agent-tokens-0123456789";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const sessionUser = vi.hoisted(() => ({ current: null as null | { id: string; role: string } }));
// Not importOriginal — the real module pulls in next-auth, which doesn't load outside Next.
vi.mock("@/lib/rbac", () => {
  class ForbiddenError extends Error {}
  class UnauthorizedError extends Error {}
  const session = async () => {
    if (!sessionUser.current) throw new UnauthorizedError("Unauthorized");
    return { user: { ...sessionUser.current, name: "Tester" } };
  };
  return {
    ROLES: ["DEVELOPER", "OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF", "CLIENT", "CAREGIVER"],
    requireSession: session,
    requireRole: session,
    isSuperuser: (role: string) => role === "OWNER" || role === "DEVELOPER",
    isAdmin: (role: string) => ["OWNER", "DEVELOPER", "ADMIN", "ACCOUNTANT"].includes(role),
    isManagement: (role: string) => ["OWNER", "DEVELOPER", "ADMIN", "ACCOUNTANT", "MANAGER"].includes(role),
    isTrackedRole: (role: string) => !!role && role !== "CAREGIVER" && role !== "CLIENT",
    ForbiddenError,
    UnauthorizedError,
  };
});

import bcrypt from "bcryptjs";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { forgetOrg } from "@/lib/tenant";
import { assignToWorkspace } from "@/lib/workspace-assignments";
import { POST as login } from "@/app/api/agent/login/route";
import { POST as consent } from "@/app/api/agent/consent/route";
import { POST as clock } from "@/app/api/agent/clock/route";
import { POST as intervals } from "@/app/api/agent/intervals/route";
import { GET as me } from "@/app/api/agent/me/route";
import { clockIn } from "@/lib/actions/time-entries";
import { setRequireDesktopClock } from "@/lib/actions/activity";
import { getTeamActivity } from "@/lib/activity-data";
import { saveMonitoringSettings } from "@/lib/actions/monitoring-settings";

// Activity monitoring scope v2 (docs/activity-monitoring-plan.md): per
// workspace, add-on + switch, never linked accounts, tokens bound to their
// workspace, no keyboard/mouse data, 2-hour no-input clock-out.

const HOME = { id: "org_am_home", slug: "am-home", name: "Managing Co" };
const CLIENT = { id: "org_am_client", slug: "am-client", name: "Client Co" };
const OFF = { id: "org_am_off", slug: "am-off", name: "No Add-on Co" };
const PASSWORD = "Correct-horse-1";

const ids: Record<string, string> = {};

function post(body: unknown, token?: string) {
  return new Request("http://test.local/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...(token && { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body),
  });
}
const device = { name: "Laptop", os: "win32", appVersion: "1.0.0" };

async function signIn(org: typeof HOME, email: string) {
  const res = await runAsTenant(org, () => login(post({ email, password: PASSWORD, device })));
  return { status: res.status, body: (await res.json()) as { accessToken?: string; deviceId?: string; error?: string } };
}

beforeAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [CLIENT.id, HOME.id, OFF.id] } } });
  await prisma.organization.create({ data: { ...HOME, activityMonitoringAddon: true, activityMonitoringEnabled: true } });
  await prisma.organization.create({
    data: { ...CLIENT, kind: "TASKS", managedByOrgId: HOME.id, activityMonitoringAddon: true, activityMonitoringEnabled: true },
  });
  await prisma.organization.create({ data: { ...OFF, activityMonitoringAddon: false, activityMonitoringEnabled: true } });
  for (const o of [HOME, CLIENT, OFF]) forgetOrg(o.slug);

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const h = tenantDb(HOME.id);
  ids.owner = (await h.user.create({ data: { name: "Olive Owner", email: "olive@am-home.test", passwordHash, role: "OWNER" } })).id;
  ids.staff = (await h.user.create({ data: { name: "Sam Staff", email: "sam@am-home.test", passwordHash, role: "STAFF" } })).id;
  ids.caregiver = (await h.user.create({ data: { name: "Cara Giver", email: "cara@am-home.test", passwordHash, role: "CAREGIVER" } })).id;
  const by = { userId: ids.owner, orgId: HOME.id, role: "OWNER", name: "Olive Owner" };
  await assignToWorkspace(by, { orgId: CLIENT.id, homeUserId: ids.staff, role: "STAFF", canAssign: false });

  const c = tenantDb(CLIENT.id);
  ids.clientOwner = (await c.user.create({ data: { name: "Cleo Client", email: "cleo@am-client.test", passwordHash, role: "OWNER" } })).id;
  // Sam's linked account in the client workspace — given a known password
  // here only so the test reaches the "never a linked account" rule.
  const linked = await c.user.findFirstOrThrow({ where: { email: "sam@am-home.test" } });
  await c.user.update({ where: { id: linked.id }, data: { passwordHash } });
  ids.linked = linked.id;

  await tenantDb(OFF.id).user.create({ data: { name: "Otto Off", email: "otto@am-off.test", passwordHash, role: "STAFF" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("desktop sign-in per workspace", () => {
  it("signs in the workspace's own staff and logs it in the sign-in history", async () => {
    const { status, body } = await signIn(HOME, "sam@am-home.test");
    expect(status).toBe(200);
    expect(body.accessToken).toBeTruthy();
    const event = await tenantDb(HOME.id).loginEvent.findFirst({ where: { userId: ids.staff }, orderBy: { createdAt: "desc" } });
    expect(event).toMatchObject({ success: true, method: "desktop_app", os: "Windows", deviceType: "DESKTOP" });
  });

  it("refuses caregivers", async () => {
    const { status, body } = await signIn(HOME, "cara@am-home.test");
    expect(status).toBe(403);
    expect(body.error).toMatch(/isn't used for your account/);
  });

  it("refuses a workspace without the add-on", async () => {
    const { status, body } = await signIn(OFF, "otto@am-off.test");
    expect(status).toBe(403);
    expect(body.error).toMatch(/isn't switched on/);
  });

  it("never tracks a linked account: sends them to their own company's workspace", async () => {
    const { status, body } = await signIn(CLIENT, "sam@am-home.test");
    expect(status).toBe(403);
    expect(body.error).toMatch(/your company's workspace/);
  });

  it("only accepts a token on the workspace that issued it", async () => {
    const { body } = await signIn(HOME, "sam@am-home.test");
    const atHome = await runAsTenant(HOME, () => me(new Request("http://test.local/api/agent/me", { headers: { authorization: `Bearer ${body.accessToken}` } })));
    expect(atHome.status).toBe(200);
    const atClient = await runAsTenant(CLIENT, () => me(new Request("http://test.local/api/agent/me", { headers: { authorization: `Bearer ${body.accessToken}` } })));
    expect(atClient.status).toBe(401);
  });
});

describe("clocking and tracking from the app", () => {
  let token = "";
  let entryId = "";

  beforeAll(async () => {
    token = (await signIn(HOME, "sam@am-home.test")).body.accessToken!;
  });

  it("needs the workspace's notice accepted before clocking in", async () => {
    const refused = await runAsTenant(HOME, () => clock(post({ action: "in" }, token)));
    expect(refused.status).toBe(400);

    const state = await (await runAsTenant(HOME, () => me(new Request("http://test.local/api/agent/me", { headers: { authorization: `Bearer ${token}` } })))).json();
    expect(state.policy.text).toMatch(/never records keyboard or mouse input/);
    expect(state.autoClockOutIdleMinutes).toBe(120);
    const accepted = await runAsTenant(HOME, () => consent(post({ policyVersion: state.policy.version }, token)));
    expect(accepted.status).toBe(200);

    const res = await runAsTenant(HOME, () => clock(post({ action: "in" }, token)));
    const body = await res.json();
    expect(body.status).toBe("CLOCKED_IN");
    expect(body.openEntry.trackingThisDevice).toBe(true);
    entryId = body.openEntry.id;
  });

  it("stores app usage only — keyboard/mouse fields an older app sends are dropped", async () => {
    const start = new Date(Date.now() - 60_000);
    const res = await runAsTenant(HOME, () =>
      intervals(
        post(
          {
            intervals: [
              {
                clientId: "iv-1",
                timeEntryId: entryId,
                start: start.toISOString(),
                end: new Date(start.getTime() + 30_000).toISOString(),
                keyCount: 99,
                mouseCount: 12,
                apps: [{ app: "Code", title: "plan.md", seconds: 30, activeSeconds: 20 }],
              },
            ],
          },
          token
        )
      )
    );
    expect(await res.json()).toEqual({ accepted: ["iv-1"], rejected: [] });
    const row = await tenantDb(HOME.id).activityInterval.findFirstOrThrow({ where: { clientId: "iv-1" } });
    expect(row.apps).toEqual([{ app: "Code", title: "plan.md", seconds: 30 }]);
    expect(row.organizationId).toBe(HOME.id);
  });

  it("the no-input clock-out ends the session when input stopped, marked automatic", async () => {
    const open = await tenantDb(HOME.id).timeEntry.findUniqueOrThrow({ where: { id: entryId } });
    const at = new Date(open.clockIn.getTime() + 1);
    const res = await runAsTenant(HOME, () => clock(post({ action: "out", at: at.toISOString() }, token)));
    expect(res.status).toBe(200);
    const entry = await tenantDb(HOME.id).timeEntry.findUniqueOrThrow({ where: { id: entryId } });
    expect(entry.clockOut?.getTime()).toBe(at.getTime());
    expect(entry.autoClosed).toBe(true);
    expect(entry.source).toBe("AGENT");
  });

  it("blocks web clock-in once the owner requires the app", async () => {
    sessionUser.current = { id: ids.owner, role: "OWNER" };
    await runAsTenant(HOME, () => setRequireDesktopClock(ids.staff, true));
    sessionUser.current = { id: ids.staff, role: "STAFF" };
    await expect(runAsTenant(HOME, () => clockIn())).rejects.toThrow(/desktop app/);
  });
});

describe("who the owner sees", () => {
  it("lists the workspace's own people, never linked accounts, and only for the owner", async () => {
    sessionUser.current = { id: ids.clientOwner, role: "OWNER" };
    const { rows } = await runAsTenant(CLIENT, () => getTeamActivity());
    expect(rows.map((r) => r.id)).toEqual([ids.clientOwner]);
    expect(rows.some((r) => r.id === ids.linked)).toBe(false);

    sessionUser.current = { id: ids.staff, role: "STAFF" };
    await expect(runAsTenant(HOME, () => getTeamActivity())).rejects.toThrow();
  });

  it("can't set app-only clock-in for a linked account", async () => {
    sessionUser.current = { id: ids.clientOwner, role: "OWNER" };
    await expect(runAsTenant(CLIENT, () => setRequireDesktopClock(ids.linked, true))).rejects.toThrow(/isn't tracked/);
  });
});

describe("the owner's switch", () => {
  it("a changed notice has to be accepted again", async () => {
    const token = (await signIn(HOME, "sam@am-home.test")).body.accessToken!;
    const read = async () =>
      (await (await runAsTenant(HOME, () => me(new Request("http://test.local/api/agent/me", { headers: { authorization: `Bearer ${token}` } })))).json()).policy;
    expect((await read()).accepted).toBe(true);

    sessionUser.current = { id: ids.owner, role: "OWNER" };
    const result = await runAsTenant(HOME, () => saveMonitoringSettings({ enabled: true, policy: "Our own notice." }));
    expect(result.ok).toBe(true);
    const policy = await read();
    expect(policy).toMatchObject({ text: "Our own notice.", accepted: false });
  });

  it("switching it off stops desktop sign-in and lets everyone clock in on the web again", async () => {
    sessionUser.current = { id: ids.owner, role: "OWNER" };
    await runAsTenant(HOME, () => saveMonitoringSettings({ enabled: false, policy: "Our own notice." }));
    const { status } = await signIn(HOME, "sam@am-home.test");
    expect(status).toBe(403);

    sessionUser.current = { id: ids.staff, role: "STAFF" };
    const entry = await runAsTenant(HOME, () => clockIn());
    expect(entry.source).toBe("WEB");
  });

  it("can't be switched on without the add-on", async () => {
    const otto = await tenantDb(OFF.id).user.findFirstOrThrow({ where: { email: "otto@am-off.test" } });
    await tenantDb(OFF.id).user.update({ where: { id: otto.id }, data: { role: "OWNER" } });
    sessionUser.current = { id: otto.id, role: "OWNER" };
    const result = await runAsTenant(OFF, () => saveMonitoringSettings({ enabled: true, policy: "" }));
    expect(result).toMatchObject({ ok: false });
  });
});
