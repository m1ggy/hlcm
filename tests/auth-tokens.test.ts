import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { systemPrisma as prisma } from "@/lib/prisma";
import { runAsTenant, tenantDb } from "@/lib/db";
import { consumeAuthToken, issueAuthToken, peekAuthToken } from "@/lib/auth-tokens";

// Invite / password-reset links (5b): single use, expiring, per org.

const A = { id: "org_tok_a", slug: "tok-a" };
const B = { id: "org_tok_b", slug: "tok-b" };
let userA: { id: string };

beforeAll(async () => {
  for (const org of [A, B]) {
    await prisma.organization.upsert({ where: { id: org.id }, create: { ...org, name: org.slug }, update: {} });
  }
  userA = await tenantDb(A.id).user.create({ data: { name: "Ann", email: "ann@tok.test", passwordHash: "x" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const inA = <T,>(fn: () => Promise<T>) => runAsTenant(A, fn);

describe("auth tokens", () => {
  it("peek shows what a valid token is for; consume works exactly once", async () => {
    const raw = await inA(() => issueAuthToken(userA.id, "INVITE"));
    expect((await inA(() => peekAuthToken(raw)))?.user.email).toBe("ann@tok.test");
    expect(await inA(() => consumeAuthToken(raw))).toEqual({ userId: userA.id, kind: "INVITE" });
    expect(await inA(() => consumeAuthToken(raw))).toBeNull();
    expect(await inA(() => peekAuthToken(raw))).toBeNull();
  });

  it("only the hash is stored", async () => {
    const raw = await inA(() => issueAuthToken(userA.id, "PASSWORD_RESET"));
    const rows = await prisma.authToken.findMany({ where: { userId: userA.id } });
    expect(rows.some((r) => r.tokenHash === raw)).toBe(false);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.tokenHash))).toBe(true);
  });

  it("issuing a new token voids the user's earlier unused one of the same kind", async () => {
    const first = await inA(() => issueAuthToken(userA.id, "PASSWORD_RESET"));
    const second = await inA(() => issueAuthToken(userA.id, "PASSWORD_RESET"));
    expect(await inA(() => consumeAuthToken(first))).toBeNull();
    expect(await inA(() => consumeAuthToken(second))).not.toBeNull();
  });

  it("an expired token doesn't work", async () => {
    const raw = await inA(() => issueAuthToken(userA.id, "PASSWORD_RESET"));
    await prisma.authToken.updateMany({ where: { userId: userA.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await inA(() => peekAuthToken(raw))).toBeNull();
    expect(await inA(() => consumeAuthToken(raw))).toBeNull();
  });

  it("a token only works on its own organization's host", async () => {
    const raw = await inA(() => issueAuthToken(userA.id, "PASSWORD_RESET"));
    expect(await runAsTenant(B, () => peekAuthToken(raw))).toBeNull();
    expect(await runAsTenant(B, () => consumeAuthToken(raw))).toBeNull();
    expect(await inA(() => consumeAuthToken(raw))).not.toBeNull();
  });

  it("a deactivated user's link doesn't work", async () => {
    const raw = await inA(() => issueAuthToken(userA.id, "PASSWORD_RESET"));
    await tenantDb(A.id).user.update({ where: { id: userA.id }, data: { active: false } });
    expect(await inA(() => consumeAuthToken(raw))).toBeNull();
    await tenantDb(A.id).user.update({ where: { id: userA.id }, data: { active: true } });
  });

  it("garbage and empty tokens are rejected", async () => {
    expect(await inA(() => consumeAuthToken(""))).toBeNull();
    expect(await inA(() => consumeAuthToken("not-a-real-token"))).toBeNull();
  });
});
