import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/form-logic";
import { UserFacingError } from "@/lib/user-facing-error";

// How someone signs in: their email, or — a caregiver only, usually a client
// company's (docs/client-care-plan.md) — the phone number on their account.
// Shared by the Users screen and the Caregivers page so both apply the same
// rules.

export const PHONE_ONLY_ROLES = ["CAREGIVER"];

/**
 * The email and phone to store for a person. Without an email the phone is
 * how they sign in, so it must be a real number and no other active person
 * may sign in with it; a phone that's someone else's sign-in can't be put
 * on another account either. Valid numbers are stored normalized (+15551234567)
 * so sign-in finds them however they're typed.
 */
export async function resolveSignInFields(input: {
  userId?: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}): Promise<{ email: string | null; phone: string | null }> {
  const email = input.email?.trim() || null;
  const rawPhone = input.phone?.trim() || null;
  const normalized = rawPhone ? normalizePhone(rawPhone) : null;

  if (!email) {
    if (!PHONE_ONLY_ROLES.includes(input.role)) throw new UserFacingError("Add an email — only caregivers can sign in with a phone number");
    if (!rawPhone) throw new UserFacingError("Add an email or a phone number — it's how they sign in");
    if (!normalized) throw new UserFacingError("Enter a valid phone number, like (555) 123-4567");
  }

  if (normalized) {
    const others = await db.user.findMany({
      where: { phone: normalized, active: true, isSupport: false, assignedFromUserId: null, ...(input.userId ? { id: { not: input.userId } } : {}) },
      select: { email: true },
    });
    // Sign-in by phone needs exactly one account on that number.
    if (!email && others.length > 0) throw new UserFacingError("Someone else already has that phone number — each person needs their own to sign in with it");
    if (others.some((o) => !o.email)) throw new UserFacingError("That phone number is how someone else signs in — use a different one");
  }

  return { email, phone: normalized ?? rawPhone };
}
