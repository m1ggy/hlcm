import { generateSecret, generateURI, verifySync } from "otplib";


export function generateMfaSecret() {
  return generateSecret();
}

// `issuer` is the name the authenticator app files the code under — the
// workspace's name, so someone in two workspaces can tell the codes apart.
export function getOtpAuthUrl(email: string, secret: string, issuer: string) {
  return generateURI({ issuer, label: email, secret });
}

export function verifyTotpToken(token: string, secret: string) {
  return verifySync({ token, secret }).valid;
}
