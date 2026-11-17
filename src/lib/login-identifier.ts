// What someone types in the sign-in box: an email, or — for a client
// company's caregiver who has none (docs/client-care-plan.md) — the phone
// number on their account. Pure, so both the login action and authorize()
// in src/auth.ts read it the same way.

import { normalizePhone } from "@/lib/form-logic";

export type LoginIdentifier =
  /** key: what login throttling counts failures against. */
  | { kind: "email"; key: string; where: { email: string } }
  | { kind: "phone"; key: string; where: { phone: string; active: true; isSupport: false; assignedFromUserId: null } };

export function parseLoginIdentifier(raw: string | null | undefined): LoginIdentifier | null {
  const value = raw?.trim();
  if (!value) return null;
  if (value.includes("@")) return { kind: "email", key: value, where: { email: value } };
  const phone = normalizePhone(value);
  // Only accounts that can sign in with a password at all, so a
  // deactivated old account on the same number doesn't block the live one.
  return phone ? { kind: "phone", key: phone, where: { phone, active: true, isSupport: false, assignedFromUserId: null } } : null;
}

/**
 * The one account an identifier signs in to, from the candidates a lookup
 * found. A phone number isn't unique the way an email is, so two people
 * sharing one (a couple on one line) can't use it to sign in — neither is
 * picked rather than guessing.
 */
export function pickLoginUser<T>(candidates: T[]): T | null {
  return candidates.length === 1 ? candidates[0] : null;
}

/** The throttling key for an account found another way (MFA step). */
export function loginKeyOf(user: { id: string; email: string | null; phone: string | null }): string {
  return user.email ?? user.phone ?? user.id;
}
