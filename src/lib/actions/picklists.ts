"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { friendlyPrismaError } from "@/lib/prisma-errors";
import { toActionResult, type ActionResult } from "@/lib/action-result";
import { UserFacingError } from "@/lib/user-facing-error";
import { codeFromLabel, PICKLIST_KINDS, type PicklistKind } from "@/lib/picklists";

// Admin > Lists: each organization edits its own agency / payer /
// ball-with choices (see src/lib/picklists.ts). An option's code is fixed
// at creation — it's what Applications/MCO credentials store — so "rename"
// only changes the label, and there's no delete: retiring an option
// (active=false) hides it from pickers while existing rows keep its label.
// Returned as ActionResults so validation messages survive production's
// redaction of thrown Server Action errors (see UserFacingError).

const ADMIN_ONLY = ["ADMIN"] as const;

const labelSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(80, "Keep it under 80 characters");

function parseLabel(raw: string) {
  const parsed = labelSchema.safeParse(raw);
  if (!parsed.success) throw new UserFacingError(parsed.error.issues[0].message);
  return parsed.data;
}

function revalidate() {
  revalidatePath("/admin/lists");
  revalidatePath("/applications", "layout");
  revalidatePath("/clients", "layout");
}

export type AdminPicklistOption = { id: string; code: string; label: string; active: boolean; sortOrder: number };

export async function listPicklistsForAdmin(): Promise<Record<PicklistKind, AdminPicklistOption[]>> {
  await requireRole([...ADMIN_ONLY]);
  const options = await db.picklistOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { id: true, list: true, code: true, label: true, active: true, sortOrder: true },
  });
  const lists = Object.fromEntries(PICKLIST_KINDS.map((kind) => [kind, [] as AdminPicklistOption[]])) as Record<
    PicklistKind,
    AdminPicklistOption[]
  >;
  for (const { list, ...option } of options) lists[list].push(option);
  return lists;
}

async function createPicklistOptionImpl(list: PicklistKind, rawLabel: string) {
  const session = await requireRole([...ADMIN_ONLY]);
  if (!PICKLIST_KINDS.includes(list)) throw new UserFacingError("Unknown list");
  const label = parseLabel(rawLabel);
  const code = codeFromLabel(label);
  if (!code) throw new UserFacingError("Use at least one letter or number in the name");

  const last = await db.picklistOption.findFirst({ where: { list }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const option = await db.picklistOption
    .create({ data: { list, code, label, sortOrder: (last?.sortOrder ?? -1) + 1 } })
    .catch((e) =>
      friendlyPrismaError(e, { duplicateMessages: { "list,code": "That list already has an option with this name (it may be retired — restore it instead)" } })
    );

  await recordAudit({
    entityType: "PicklistOption",
    entityId: option.id,
    action: "create",
    actorId: session.user.id,
    newValue: `${list}:${label}`,
  });
  revalidate();
}

export async function createPicklistOption(list: PicklistKind, label: string): Promise<ActionResult<void>> {
  return toActionResult(() => createPicklistOptionImpl(list, label));
}

async function renamePicklistOptionImpl(id: string, rawLabel: string) {
  const session = await requireRole([...ADMIN_ONLY]);
  const label = parseLabel(rawLabel);
  const before = await db.picklistOption.findUniqueOrThrow({ where: { id } });
  if (before.label === label) return;
  await db.picklistOption.update({ where: { id }, data: { label } });

  await recordAudit({
    entityType: "PicklistOption",
    entityId: id,
    action: "rename",
    actorId: session.user.id,
    oldValue: before.label,
    newValue: label,
  });
  revalidate();
}

export async function renamePicklistOption(id: string, label: string): Promise<ActionResult<void>> {
  return toActionResult(() => renamePicklistOptionImpl(id, label));
}

async function setPicklistOptionActiveImpl(id: string, active: boolean) {
  const session = await requireRole([...ADMIN_ONLY]);
  const before = await db.picklistOption.findUniqueOrThrow({ where: { id } });
  if (before.active === active) return;
  await db.picklistOption.update({ where: { id }, data: { active } });

  await recordAudit({
    entityType: "PicklistOption",
    entityId: id,
    action: active ? "restore" : "retire",
    actorId: session.user.id,
    newValue: `${before.list}:${before.label}`,
  });
  revalidate();
}

export async function setPicklistOptionActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return toActionResult(() => setPicklistOptionActiveImpl(id, active));
}
