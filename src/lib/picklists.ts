import { db } from "@/lib/db";
import type { $Enums } from "@/generated/prisma/client";

// Per-organization picklists (see PicklistOption in prisma/schema.prisma):
// the agency a case is filed with, the MCO/payer a client credentials with,
// and whose court the ball is in. Rows store an option's `code`; the org's
// option supplies the label. Edited under Admin > Lists.

export type PicklistKind = $Enums.PicklistKind;
export const PICKLIST_KINDS: readonly PicklistKind[] = ["AGENCY", "PAYER", "BALL_WITH"];

export type PicklistChoice = { code: string; label: string; active: boolean };
export type Picklists = Record<PicklistKind, PicklistChoice[]>;

/** The current org's lists, every option (retired ones included), in display order. */
export async function getPicklists(): Promise<Picklists> {
  const options = await db.picklistOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { list: true, code: true, label: true, active: true },
  });
  const lists: Picklists = { AGENCY: [], PAYER: [], BALL_WITH: [] };
  for (const { list, ...choice } of options) lists[list].push(choice);
  return lists;
}

/** code → label for one list; a code with no option (deleted data) shows as itself. */
export function picklistLabels(choices: PicklistChoice[]): Record<string, string> {
  return Object.fromEntries(choices.map((c) => [c.code, c.label]));
}

/**
 * What a picker should offer: the active options, plus the row's current
 * value if it's since been retired — so editing a row never silently
 * blanks a value it already has.
 */
export function pickerChoices(choices: PicklistChoice[], current?: string | null): PicklistChoice[] {
  return choices.filter((c) => c.active || c.code === current);
}

/** Stable code for a new option, derived from its label ("BCBS IL" → "BCBS_IL"). */
export function codeFromLabel(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase()
    .slice(0, 60);
}

/** Whether `code` is an option in the current org's `list` (active or not). */
export async function isPicklistCode(list: PicklistKind, code: string): Promise<boolean> {
  return (await db.picklistOption.count({ where: { list, code } })) > 0;
}

/**
 * Starting lists for a brand-new organization (see seedOrganization). Kept
 * generic on purpose — the Illinois agencies/MCOs CTK uses were seeded for
 * existing orgs by the per_org_picklists migration; a new tenant adds its
 * own state's under Admin > Lists.
 */
export function defaultPicklists(orgName: string): Record<PicklistKind, { code: string; label: string }[]> {
  return {
    AGENCY: [{ code: "OTHER", label: "Other" }],
    PAYER: [{ code: "OTHER", label: "Other" }],
    BALL_WITH: [
      { code: "US", label: orgName },
      { code: "CLIENT", label: "Client" },
      { code: "GOVERNMENT", label: "Government" },
    ],
  };
}
