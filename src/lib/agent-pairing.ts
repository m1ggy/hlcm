import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";

// "Connect" link from the web page to the desktop app: someone signed in on
// the web clicks Connect, the page opens carenela://connect?server=…&code=…,
// and the app trades the code at /api/agent/pair for its own device tokens.
// So nobody types a workspace name or password into the app.
//
// The code is a short-lived signed token (AUTH_SECRET) naming the person and
// the workspace, and it works once: used ids are remembered in memory until
// they'd have expired anyway. The app server is one process, the same
// assumption login-throttle.ts makes; a restart forgets used ids, but a code
// only lives 5 minutes and only ever opens an app for its own person.

const ALG = "HS256";
const PURPOSE = "agent-pair";
const TTL_SECONDS = 5 * 60;

const used = new Map<string, number>();

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createPairingCode(userId: string, orgId: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, org: orgId })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());
}

/** The person the code was made for, or null if it's invalid, expired, already used or from another workspace. */
export async function consumePairingCode(code: string, orgId: string): Promise<string | null> {
  let payload;
  try {
    ({ payload } = await jwtVerify(code, getSecret(), { algorithms: [ALG] }));
  } catch {
    return null;
  }
  if (payload.purpose !== PURPOSE || payload.org !== orgId || typeof payload.sub !== "string" || typeof payload.jti !== "string") return null;

  const now = Date.now();
  for (const [id, expiresAt] of used) if (expiresAt < now) used.delete(id);
  if (used.has(payload.jti)) return null;
  used.set(payload.jti, (payload.exp ?? 0) * 1000);
  return payload.sub;
}
