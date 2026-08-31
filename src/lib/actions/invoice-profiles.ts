"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { saveUploadedFile, deleteStoredFile } from "@/lib/storage";

// Structural org config, same tier as license types / case types — Admin
// only, not Manager (who can still manage individual invoices).
const ADMIN_ONLY = ["ADMIN"] as const;

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listInvoiceProfilesForAdmin() {
  await requireRole([...ADMIN_ONLY]);
  return prisma.invoiceProfile.findMany({ orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
}

const textSchema = z.object({
  name: z.string().min(1, "Name is required"),
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

export async function createInvoiceProfile(input: z.infer<typeof textSchema>) {
  const session = await requireRole([...ADMIN_ONLY]);
  const parsed = textSchema.parse(input);
  const ccEmails = validateCcEmails(parsed.ccEmails);
  const footerText = parsed.footerText?.trim() || null;

  // The very first profile ever created is always the default — there's
  // no "no profile selected" state for the invoice dialog to fall back
  // to otherwise.
  const existingCount = await prisma.invoiceProfile.count();

  const profile = await prisma.invoiceProfile.create({
    data: { name: parsed.name.trim(), ccEmails, footerText, isDefault: existingCount === 0 },
  });

  await recordAudit({
    entityType: "InvoiceProfile",
    entityId: profile.id,
    action: "create",
    actorId: session.user.id,
    newValue: profile.name,
  });

  revalidatePath("/admin/invoice-profiles");
  revalidatePath("/invoices");
  return profile;
}

export async function updateInvoiceProfileText(id: string, input: z.infer<typeof textSchema>) {
  const session = await requireRole([...ADMIN_ONLY]);
  const parsed = textSchema.parse(input);
  const ccEmails = validateCcEmails(parsed.ccEmails);
  const footerText = parsed.footerText?.trim() || null;

  const updated = await prisma.invoiceProfile.update({
    where: { id },
    data: { name: parsed.name.trim(), ccEmails, footerText },
  });

  await recordAudit({
    entityType: "InvoiceProfile",
    entityId: id,
    action: "update",
    actorId: session.user.id,
  });

  revalidatePath("/admin/invoice-profiles");
  revalidatePath("/invoices");
  return updated;
}

export async function updateInvoiceProfileLogo(id: string, formData: FormData) {
  const session = await requireRole([...ADMIN_ONLY]);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image file");
  if (!ALLOWED_LOGO_TYPES.has(file.type)) throw new Error("Logo must be a PNG or JPEG image");

  const before = await prisma.invoiceProfile.findUniqueOrThrow({ where: { id } });
  const { storageKey } = await saveUploadedFile(file);

  const updated = await prisma.invoiceProfile.update({
    where: { id },
    data: { logoStorageKey: storageKey, logoMimeType: file.type },
  });

  // Swap-then-delete — never leave the profile pointing at a storage key
  // that's already been removed if the delete happens first.
  if (before.logoStorageKey) await deleteStoredFile(before.logoStorageKey);

  await recordAudit({
    entityType: "InvoiceProfile",
    entityId: id,
    action: "update_logo",
    actorId: session.user.id,
  });

  revalidatePath("/admin/invoice-profiles");
  return updated;
}

export async function removeInvoiceProfileLogo(id: string) {
  const session = await requireRole([...ADMIN_ONLY]);
  const before = await prisma.invoiceProfile.findUniqueOrThrow({ where: { id } });
  if (!before.logoStorageKey) return before;

  const updated = await prisma.invoiceProfile.update({
    where: { id },
    data: { logoStorageKey: null, logoMimeType: null },
  });
  await deleteStoredFile(before.logoStorageKey);

  await recordAudit({
    entityType: "InvoiceProfile",
    entityId: id,
    action: "remove_logo",
    actorId: session.user.id,
  });

  revalidatePath("/admin/invoice-profiles");
  return updated;
}

export async function setDefaultInvoiceProfile(id: string) {
  const session = await requireRole([...ADMIN_ONLY]);

  await prisma.$transaction([
    prisma.invoiceProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.invoiceProfile.update({ where: { id }, data: { isDefault: true } }),
  ]);

  await recordAudit({
    entityType: "InvoiceProfile",
    entityId: id,
    action: "set_default",
    actorId: session.user.id,
  });

  revalidatePath("/admin/invoice-profiles");
  revalidatePath("/invoices");
}

export async function deleteInvoiceProfile(id: string) {
  const session = await requireRole([...ADMIN_ONLY]);

  const profile = await prisma.invoiceProfile.findUniqueOrThrow({ where: { id } });
  if (profile.isDefault) throw new Error("Set another profile as default before deleting this one");

  const total = await prisma.invoiceProfile.count();
  if (total <= 1) throw new Error("At least one invoice profile is required");

  // Historical invoices keep their own record of what they were billed
  // under regardless — the FK is onDelete: SetNull, so this never blocks
  // on or destroys an existing invoice.
  if (profile.logoStorageKey) await deleteStoredFile(profile.logoStorageKey);
  await prisma.invoiceProfile.delete({ where: { id } });

  await recordAudit({
    entityType: "InvoiceProfile",
    entityId: id,
    action: "delete",
    actorId: session.user.id,
    newValue: profile.name,
  });

  revalidatePath("/admin/invoice-profiles");
  revalidatePath("/invoices");
}
