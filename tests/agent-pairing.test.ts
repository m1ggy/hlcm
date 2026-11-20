import { beforeAll, describe, expect, it } from "vitest";
import { createMfaChallenge } from "@/lib/mfa-challenge";
import { consumePairingCode, createPairingCode } from "@/lib/agent-pairing";

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
