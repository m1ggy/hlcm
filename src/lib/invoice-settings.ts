// Reads the org-wide InvoiceSettings singleton — logo, CC list, footer
// text — applied to every manually-recorded invoice's PDF and emails.
// Plain data helper (no RBAC, no "use server"): safe to call from
// generateInvoicePdf's callers, unlike the admin-only write actions in
// src/lib/actions/invoice-settings.ts.
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";

const SINGLETON_ID = "singleton";

export type InvoiceSettingsData = {
  logoStorageKey: string | null;
  logoMimeType: string | null;
  ccEmails: string | null;
  footerText: string | null;
};

const DEFAULTS: InvoiceSettingsData = {
  logoStorageKey: null,
  logoMimeType: null,
  ccEmails: null,
  footerText: null,
};

export async function getInvoiceSettings(): Promise<InvoiceSettingsData> {
  const row = await prisma.invoiceSettings.findUnique({ where: { id: SINGLETON_ID } });
  return row ?? DEFAULTS;
}

export function parseCcEmails(ccEmails: string | null): string[] {
  if (!ccEmails) return [];
  return ccEmails
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fetches the logo's actual bytes from storage — only when one is set. */
export async function getInvoiceLogo(
  settings: Pick<InvoiceSettingsData, "logoStorageKey" | "logoMimeType">
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!settings.logoStorageKey || !settings.logoMimeType) return null;
  const bytes = await readStoredFile(settings.logoStorageKey);
  return { bytes, mimeType: settings.logoMimeType };
}
