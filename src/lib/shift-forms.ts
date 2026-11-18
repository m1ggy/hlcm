import { db } from "@/lib/db";
import { fieldDefs } from "@/lib/form-submit";
import { TimeClockError } from "@/lib/time-entries";

// Shift forms (docs/shift-forms-plan.md): forms caregivers fill in the app
// when they end a visit. The office marks a form as a shift form, for every
// client's visits or only chosen care clients; several can apply to one
// visit. A caregiver can't end the visit until each applicable form is
// filled for it (assertShiftFormsDone, called from the clock rules). Admin
// corrections on the web are never blocked.

export type VisitRef = { visitId: string; careRecipientId: string };

/** The active shift forms that apply to visits with this care client. */
export async function shiftFormsFor(careRecipientId: string) {
  return db.formTemplate.findMany({
    where: {
      active: true,
      shiftForm: true,
      OR: [{ shiftAllClients: true }, { shiftClients: { some: { careRecipientId } } }],
    },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });
}

/** Shift forms this caregiver still has to fill for this visit, with what the app needs to show them. */
export async function missingShiftForms(userId: string, visit: VisitRef) {
  const forms = await shiftFormsFor(visit.careRecipientId);
  if (forms.length === 0) return [];
  const done = await db.formSubmission.findMany({
    where: { visitId: visit.visitId, submittedById: userId, templateId: { in: forms.map((f) => f.id) } },
    select: { templateId: true },
  });
  const filled = new Set(done.map((d) => d.templateId));
  return forms
    .filter((f) => !filled.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, description: f.description, fields: fieldDefs(f.fields) }));
}

export class ShiftFormsMissingError extends TimeClockError {
  constructor(names: string[]) {
    super(
      names.length === 1
        ? `Fill in "${names[0]}" before ending the visit`
        : `Fill in these forms before ending the visit: ${names.map((n) => `"${n}"`).join(", ")}`
    );
    this.name = "ShiftFormsMissingError";
  }
}

/** Throws ShiftFormsMissingError when this visit still needs shift forms. */
export async function assertShiftFormsDone(userId: string, visit: VisitRef | null) {
  if (!visit) return;
  const missing = await missingShiftForms(userId, visit);
  if (missing.length > 0) throw new ShiftFormsMissingError(missing.map((f) => f.name));
}
