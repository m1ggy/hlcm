import { beforeAll, describe, expect, it, vi } from "vitest";
import { createMfaChallenge } from "@/lib/mfa-challenge";
import { consumePairingCode, createPairingCode } from "@/lib/agent-pairing";

// The real module pulls in next-auth, which doesn't load outside Next.
vi.mock("@/lib/rbac", () => ({ isTrackedRole: () => true, isSuperuser: () => false }));

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-agent-pairing";
});

describe("desktop connect codes", () => {
  it("work once, for their own person and workspace", async () => {
    const code = await createPairingCode("user-1", "org-1");
    expect(await consumePairingCode(code, "org-1")).toBe("user-1");
    expect(await consumePairingCode(code, "org-1")).toBeNull();
  });

  it("don't work on another workspace", async () => {
    const code = await createPairingCode("user-1", "org-1");
    expect(await consumePairingCode(code, "org-2")).toBeNull();
  });

  it("refuse other signed tokens and junk", async () => {
    expect(await consumePairingCode(await createMfaChallenge("user-1"), "org-1")).toBeNull();
    expect(await consumePairingCode("not-a-token", "org-1")).toBeNull();
  });
});

describe("agent API with no workspace", () => {
  it("answers 503 with a clear message instead of crashing", async () => {
    const { agentJson } = await import("@/lib/agent-auth");
    const { TenantNotResolvedError } = await import("@/lib/db");
    const response = await agentJson(async () => {
      throw new TenantNotResolvedError();
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/Workspace not found/);
  });
});
