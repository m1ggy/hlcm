import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const PURPOSE = "mfa-challenge";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// Issued after email+password verify successfully for an MFA-enabled user,
// so the /login/mfa step only needs to prove "knows the OTP", not re-send the password.
export async function createMfaChallenge(userId: string) {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSecret());
}

export async function verifyMfaChallenge(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (payload.purpose !== PURPOSE || typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}
