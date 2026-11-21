import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { ZodError } from "zod";
import { db, currentOrg, currentOrganization, TenantNotResolvedError } from "@/lib/db";
import { isTrackablePerson, monitoringOn } from "@/lib/activity-monitoring";
import { UserFacingError } from "@/lib/user-facing-error";

// Desktop tracker auth. NextAuth's 15-min cookie session doesn't fit an app
// that runs all day in the tray, so each installed copy is an AgentDevice:
//   - access token: HS256 JWT (AUTH_SECRET), 15 min, carries userId + deviceId
//   - refresh token: 32 random bytes, only its SHA-256 is stored, rotated on
//     every refresh, expires after 30 days without one
// Presenting an already-rotated refresh token means it was copied, so the
// device is revoked outright (refresh-token reuse detection).
//
// Workspaces: the app talks to its workspace's own address, so `db` is
// scoped by the request host like any page. The access token also carries
// the workspace id and is only accepted on that workspace's host. Every
// call re-checks that monitoring is on there and the person is trackable
// (src/lib/activity-monitoring.ts).

const ALG = "HS256";
const PURPOSE = "agent-access";
const ACCESS_TTL = "15m";
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// lastSeenAt is informational ("app last online") — no need to write it on
// every request; heartbeats already land once a minute.
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export class AgentAuthError extends UserFacingError {
  readonly status: number;
  constructor(message = "Sign in to the desktop app again", status = 401) {
    super(message);
    this.name = "AgentAuthError";
    this.status = status;
  }
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sameHash(a: string, b: string) {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function clientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function signAccessToken(userId: string, deviceId: string) {
  const org = await currentOrg();
  return new SignJWT({ purpose: PURPOSE, did: deviceId, org: org.id })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(getSecret());
}

export type AgentTokens = { deviceId: string; accessToken: string; refreshToken: string; refreshExpiresAt: string };

async function tokensFor(userId: string, deviceId: string, refreshToken: string, refreshExpiresAt: Date): Promise<AgentTokens> {
  return {
    deviceId,
    accessToken: await signAccessToken(userId, deviceId),
    refreshToken,
    refreshExpiresAt: refreshExpiresAt.toISOString(),
  };
}

const NOT_TRACKED = "The desktop app isn't used for your account in this workspace";
const MONITORING_OFF = "Activity monitoring isn't switched on for this workspace";

/** Throws unless monitoring is on in this workspace and this person is tracked here. */
export async function assertAgentAllowed(user: { role: string; active: boolean; isSupport: boolean; assignedFromUserId: string | null }) {
  if (!user.active) throw new AgentAuthError("Your account is inactive");
  if (user.assignedFromUserId) {
    throw new AgentAuthError("You work in this workspace for your own company — sign in to the desktop app with your company's workspace instead", 403);
  }
  if (!isTrackablePerson(user)) throw new AgentAuthError(NOT_TRACKED, 403);
  if (!monitoringOn(await currentOrganization())) throw new AgentAuthError(MONITORING_OFF, 403);
}

export type DeviceInfo = { name: string; os: string; appVersion: string };

/** Called after a full password (+ MFA) sign-in — one new device per sign-in. */
export async function registerDevice(userId: string, info: DeviceInfo, ip: string | null): Promise<AgentTokens> {
  const refreshToken = randomBytes(32).toString("base64url");
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const device = await db.agentDevice.create({
    data: {
      userId,
      name: info.name,
      os: info.os,
      appVersion: info.appVersion,
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt,
      lastSeenAt: new Date(),
      lastIp: ip,
    },
  });
  return tokensFor(userId, device.id, refreshToken, refreshExpiresAt);
}

export async function refreshDevice(
  deviceId: string,
  refreshToken: string,
  info: Partial<DeviceInfo>,
  ip: string | null
): Promise<AgentTokens> {
  const device = await db.agentDevice.findUnique({ where: { id: deviceId }, include: { user: true } });
  if (!device || device.revokedAt || device.refreshExpiresAt < new Date()) throw new AgentAuthError();

  if (!sameHash(hashToken(refreshToken), device.refreshTokenHash)) {
    await db.agentDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    throw new AgentAuthError();
  }
  await assertAgentAllowed(device.user);

  const nextToken = randomBytes(32).toString("base64url");
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await db.agentDevice.update({
    where: { id: device.id },
    data: {
      refreshTokenHash: hashToken(nextToken),
      refreshExpiresAt,
      lastSeenAt: new Date(),
      lastIp: ip,
      ...(info.appVersion ? { appVersion: info.appVersion } : {}),
      ...(info.name ? { name: info.name } : {}),
    },
  });
  return tokensFor(device.userId, device.id, nextToken, refreshExpiresAt);
}

export async function revokeDevice(deviceId: string) {
  await db.agentDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
}

/**
 * Verifies the `Authorization: Bearer` access token and re-checks the
 * device and user on every call — a revoked device, deactivated user or a
 * role change away from a tracked role all take effect immediately, not
 * when the token expires.
 */
export async function authenticateAgent(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AgentAuthError();

  let userId: string;
  let deviceId: string;
  let orgId: string;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string" || typeof payload.did !== "string" || typeof payload.org !== "string") {
      throw new AgentAuthError();
    }
    userId = payload.sub;
    deviceId = payload.did;
    orgId = payload.org;
  } catch {
    throw new AgentAuthError();
  }
  // A token from one workspace is never good on another's address.
  if (orgId !== (await currentOrg()).id) throw new AgentAuthError();

  const device = await db.agentDevice.findUnique({
    where: { id: deviceId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, active: true, timezone: true, isSupport: true, assignedFromUserId: true } },
    },
  });
  if (!device || device.userId !== userId || device.revokedAt) throw new AgentAuthError();
  await assertAgentAllowed(device.user);

  const ip = clientIp(request);
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS || device.lastIp !== ip) {
    await db.agentDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), lastIp: ip } });
  }

  const { user, ...deviceRow } = device;
  return { user, device: deviceRow, ip };
}

export type AgentContext = Awaited<ReturnType<typeof authenticateAgent>>;

/**
 * Turns thrown errors into JSON the desktop app can show: auth errors keep
 * their status, UserFacingError/zod failures are 400 with the message, and
 * anything else is a logged 500 with no internals leaked.
 */
export async function agentJson(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const body = await fn();
    return body instanceof NextResponse ? body : NextResponse.json(body ?? { ok: true });
  } catch (error) {
    if (error instanceof AgentAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }
    if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: 400 });
    // Bare domain, unknown short name or suspended workspace: say so instead of
    // logging a crash. 503, not 404: the app keeps (and retries) queued uploads
    // on 5xx but deletes them on 4xx, and a suspended workspace may come back.
    if (error instanceof TenantNotResolvedError) {
      return NextResponse.json({ error: "Workspace not found or not active. Check the workspace short name." }, { status: 503 });
    }
    console.error("Agent API error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
