// Reads InvoiceProfile rows — the org's billing identities (logo, CC
// list, footer text), one of which every manually-recorded invoice is
// billed under. Plain data helpers (no RBAC, no "use server"): safe to
// call from generateInvoicePdf's callers and from the "New Manual
// Invoice" dialog's own action, unlike the admin-only write actions in
// src/lib/actions/invoice-profiles.ts.
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";

export type InvoiceProfileData = {
  id: string;
  name: string;
  isDefault: boolean;
  logoStorageKey: string | null;
  logoMimeType: string | null;
  ccEmails: string | null;
  footerText: string | null;
};

export async function listInvoiceProfiles(): Promise<InvoiceProfileData[]> {
  return prisma.invoiceProfile.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
}

export async function getDefaultInvoiceProfile(): Promise<InvoiceProfileData | null> {
  const profile = await prisma.invoiceProfile.findFirst({ where: { isDefault: true } });
  return profile ?? (await prisma.invoiceProfile.findFirst({ orderBy: { createdAt: "asc" } }));
}

export async function getInvoiceProfile(id: string | null): Promise<InvoiceProfileData | null> {
  if (!id) return getDefaultInvoiceProfile();
  const profile = await prisma.invoiceProfile.findUnique({ where: { id } });
  return profile ?? getDefaultInvoiceProfile();
}

export function parseCcEmails(ccEmails: string | null): string[] {
  if (!ccEmails) return [];
  return ccEmails
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fetches the logo's actual bytes from storage — only when the profile has one. */
export async function getInvoiceLogo(
  profile: Pick<InvoiceProfileData, "logoStorageKey" | "logoMimeType"> | null
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!profile?.logoStorageKey || !profile.logoMimeType) return null;
  const bytes = await readStoredFile(profile.logoStorageKey);
  return { bytes, mimeType: profile.logoMimeType };
}
