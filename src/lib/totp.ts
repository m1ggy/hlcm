import { generateSecret, generateURI, verifySync } from "otplib";

const ISSUER = "HCLM";

export function generateMfaSecret() {
  return generateSecret();
}

export function getOtpAuthUrl(email: string, secret: string) {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export function verifyTotpToken(token: string, secret: string) {
  return verifySync({ token, secret }).valid;
}
