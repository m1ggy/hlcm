import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const PURPOSE = "password-reset";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// Ties a token to the password it was issued against: once the password
// changes (via this link or any other way) the fingerprint no longer matches,
// which is what makes the link single-use without a tokens table.
function fingerprint(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

export async function createPasswordResetToken(user: { id: string; passwordHash: string }) {
  return new SignJWT({ purpose: PURPOSE, fp: fingerprint(user.passwordHash) })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(getSecret());
}

/** Signature/expiry/purpose check only — the caller still has to load the
 * user and confirm the token with `matchesPasswordResetToken`. */
export async function verifyPasswordResetToken(
  token: string
): Promise<{ userId: string; fp: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string" || typeof payload.fp !== "string") {
      return null;
    }
    return { userId: payload.sub, fp: payload.fp };
  } catch {
    return null;
  }
}

export function matchesPasswordResetToken(fp: string, passwordHash: string) {
  return fp === fingerprint(passwordHash);
}
