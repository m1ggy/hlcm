import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import type { $Enums } from "@/generated/prisma/client";

// Single-use links for setting a password without knowing the current one:
// an emailed invite for a new user, or a "forgot password" reset. The raw
// token only ever exists in the email; the database keeps its SHA-256, so a
// DB dump can't be replayed into working links. Everything goes through the
// tenant client, so a token only works on its own organization's host.

export type AuthTokenKind = $Enums.AuthTokenKind;

const TTL_MS: Record<AuthTokenKind, number> = {
  INVITE: 7 * 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Issues a fresh token (voiding the user's earlier unused ones of the same kind) and returns the raw value to email. */
export async function issueAuthToken(userId: string, kind: AuthTokenKind): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.$transaction(async (tx) => {
    await tx.authToken.deleteMany({ where: { userId, kind, usedAt: null } });
    await tx.authToken.create({ data: { userId, kind, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TTL_MS[kind]) } });
  });
  return raw;
}

/** What a still-valid token is for, without using it up — for rendering the set-password page. */
export async function peekAuthToken(raw: string) {
  if (!raw) return null;
  const token = await db.authToken.findFirst({
    where: { tokenHash: hashToken(raw), usedAt: null, expiresAt: { gt: new Date() } },
    select: { kind: true, user: { select: { name: true, email: true, active: true } } },
  });
  return token && token.user.active ? token : null;
}

/**
 * Uses up a valid token and returns its user, or null if it's unknown,
 * expired, already used, or the user is deactivated. The conditional update
 * makes it single-use even if two requests race on the same link.
 */
export async function consumeAuthToken(raw: string) {
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const token = await db.authToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, kind: true, userId: true, user: { select: { active: true } } },
  });
  if (!token || !token.user.active) return null;
  const { count } = await db.authToken.updateMany({ where: { id: token.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count !== 1) return null;
  return { userId: token.userId, kind: token.kind };
}
