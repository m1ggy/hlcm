"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveUploadedFile, deleteStoredFile } from "@/lib/storage";
import { getInvoiceSettings } from "@/lib/invoice-settings";

const SINGLETON_ID = "singleton";
// Structural org config, same tier as license types / case types — Admin
// only, not Manager (who can still manage individual invoices).
const ADMIN_ONLY = ["ADMIN"] as const;

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getInvoiceSettingsForAdmin() {
  await requireRole([...ADMIN_ONLY]);
  return getInvoiceSettings();
}

const textSchema = z.object({
  ccEmails: z.string().optional(),
  footerText: z.string().optional(),
});

function validateCcEmails(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const emails = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const email of emails) {
    if (!EMAIL_RE.test(email)) throw new Error(`"${email}" doesn't look like a valid email`);
  }
  return emails.join(", ");
}

export async function updateInvoiceSettingsText(input: z.infer<typeof textSchema>) {
  const session = await requireRole([...ADMIN_ONLY]);
  const parsed = textSchema.parse(input);
  const ccEmails = validateCcEmails(parsed.ccEmails);
  const footerText = parsed.footerText?.trim() || null;

  const updated = await prisma.invoiceSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ccEmails, footerText },
    update: { ccEmails, footerText },
  });

  await recordAudit({
    entityType: "InvoiceSettings",
    entityId: SINGLETON_ID,
    action: "update",
    actorId: session.user.id,
  });

  revalidatePath("/admin/invoice-settings");
  return updated;
}

export async function updateInvoiceLogo(formData: FormData) {
  const session = await requireRole([...ADMIN_ONLY]);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file");
  if (!ALLOWED_LOGO_TYPES.has(file.type)) throw new Error("Logo must be a PNG or JPEG image");

  const before = await prisma.invoiceSettings.findUnique({ where: { id: SINGLETON_ID } });
  const { storageKey } = await saveUploadedFile(file);

  const updated = await prisma.invoiceSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, logoStorageKey: storageKey, logoMimeType: file.type },
    update: { logoStorageKey: storageKey, logoMimeType: file.type },
  });

  // Swap-then-delete — never leave the settings row pointing at a
  // storage key that's already been removed if the delete happens first.
  if (before?.logoStorageKey) await deleteStoredFile(before.logoStorageKey);

  await recordAudit({
    entityType: "InvoiceSettings",
    entityId: SINGLETON_ID,
    action: "update_logo",
    actorId: session.user.id,
  });

  revalidatePath("/admin/invoice-settings");
  return updated;
}

export async function removeInvoiceLogo() {
  const session = await requireRole([...ADMIN_ONLY]);
  const before = await prisma.invoiceSettings.findUnique({ where: { id: SINGLETON_ID } });
  if (!before?.logoStorageKey) return before;

  const updated = await prisma.invoiceSettings.update({
    where: { id: SINGLETON_ID },
    data: { logoStorageKey: null, logoMimeType: null },
  });
  await deleteStoredFile(before.logoStorageKey);

  await recordAudit({
    entityType: "InvoiceSettings",
    entityId: SINGLETON_ID,
    action: "remove_logo",
    actorId: session.user.id,
  });

  revalidatePath("/admin/invoice-settings");
  return updated;
}
