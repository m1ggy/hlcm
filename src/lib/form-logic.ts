// Public intake forms (docs/forms-plan.md): the rules both the browser and
// the server use — field types, "show this only if…", validation and how an
// answer is displayed. Pure (no database, no Next), so the form, the builder
// preview and submitForm all agree.

export const FORM_FIELD_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
  "NUMBER",
  "DATE",
  "SELECT",
  "RADIO",
  "MULTI_CHECKBOX",
  "CHECKBOX",
  "FILE",
  "HEADING",
  "PARAGRAPH",
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  TEXT: "Short answer",
  LONG_TEXT: "Paragraph answer",
  EMAIL: "Email",
  PHONE: "Phone",
  NUMBER: "Number",
  DATE: "Date",
  SELECT: "Dropdown",
  RADIO: "Choose one",
  MULTI_CHECKBOX: "Choose several",
  CHECKBOX: "Yes/no checkbox",
  FILE: "File upload",
  HEADING: "Section heading",
  PARAGRAPH: "Text block",
};

/** Layout-only blocks: no answer, never required. */
export const isLayoutField = (type: string) => type === "HEADING" || type === "PARAGRAPH";
export const hasOptions = (type: string) => type === "SELECT" || type === "RADIO" || type === "MULTI_CHECKBOX";

export type ShowIf = { key: string; op: "equals" | "not_equals" | "filled" | "includes"; value?: string };
export const SHOW_IF_OPS: Record<ShowIf["op"], string> = {
  equals: "is",
  not_equals: "is not",
  includes: "includes",
  filled: "is answered",
};

export type FormFieldDef = {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
  helpText?: string | null;
  placeholder?: string | null;
  showIf?: ShowIf | null;
};

/** An answer: text, a list (several choices), or nothing. Checkboxes are "yes". */
export type Answer = string | string[];
export type Answers = Record<string, Answer | undefined>;

const asList = (a: Answer | undefined) => (Array.isArray(a) ? a : a ? [a] : []);
const isFilled = (a: Answer | undefined) => asList(a).some((v) => v.trim() !== "");

export function parseShowIf(raw: unknown): ShowIf | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || !r.key || !(typeof r.op === "string" && r.op in SHOW_IF_OPS)) return null;
  return { key: r.key, op: r.op as ShowIf["op"], ...(typeof r.value === "string" && { value: r.value }) };
}

/**
 * Whether `field` is shown, given the answers so far. A field whose
 * condition points at a hidden field is hidden too (so a chain collapses).
 */
export function isFieldVisible(field: FormFieldDef, fields: FormFieldDef[], answers: Answers, seen = new Set<string>()): boolean {
  const cond = field.showIf;
  if (!cond) return true;
  if (seen.has(field.key)) return true; // a loop in the conditions: don't hide
  const target = fields.find((f) => f.key === cond.key);
  if (!target) return true; // the field it depended on was removed
  if (!isFieldVisible(target, fields, answers, new Set([...seen, field.key]))) return false;
  const answer = answers[cond.key];
  const want = (cond.value ?? "").trim().toLowerCase();
  const values = asList(answer).map((v) => v.trim().toLowerCase());
  switch (cond.op) {
    case "filled":
      return isFilled(answer);
    case "equals":
      return values.length > 0 && values.every((v) => v === want);
    case "not_equals":
      return !values.includes(want);
    case "includes":
      return values.includes(want);
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** US-first phone check: 10 digits (optionally +1), or any +country number of 8–15 digits. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/**
 * Checks answers against the visible fields. Returns errors by field key
 * (empty = fine). Files are checked by count only here; sizes and types on
 * the server.
 */
export function validateAnswers(fields: FormFieldDef[], answers: Answers, fileCounts: Record<string, number> = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (isLayoutField(f.type) || !isFieldVisible(f, fields, answers)) continue;
    const a = answers[f.key];
    if (f.type === "FILE") {
      if (f.required && !(fileCounts[f.key] > 0)) errors[f.key] = "Add a file";
      continue;
    }
    if (f.type === "CHECKBOX") {
      if (f.required && a !== "yes") errors[f.key] = "Please tick this box";
      continue;
    }
    if (!isFilled(a)) {
      if (f.required) errors[f.key] = hasOptions(f.type) ? "Choose an option" : "This is required";
      continue;
    }
    const text = typeof a === "string" ? a.trim() : "";
    if (f.type === "EMAIL" && !EMAIL_RE.test(text)) errors[f.key] = "Enter a valid email, like name@example.com";
    else if (f.type === "PHONE" && !normalizePhone(text)) errors[f.key] = "Enter a valid phone number, like (555) 123-4567";
    else if (f.type === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(text.replace(/,/g, ""))) errors[f.key] = "Enter a number";
    else if (f.type === "DATE" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) errors[f.key] = "Enter a date";
    else if (hasOptions(f.type)) {
      const bad = asList(a).find((v) => !f.options.includes(v));
      if (bad !== undefined) errors[f.key] = "Choose one of the options";
      if (f.type !== "MULTI_CHECKBOX" && Array.isArray(a)) errors[f.key] = "Choose one option";
    } else if (text.length > 10_000) errors[f.key] = "That's too long";
  }
  return errors;
}

/** The answers worth keeping: visible fields only, trimmed, empty ones dropped. */
export function cleanAnswers(fields: FormFieldDef[], answers: Answers): Record<string, Answer> {
  const out: Record<string, Answer> = {};
  for (const f of fields) {
    if (isLayoutField(f.type) || f.type === "FILE" || !isFieldVisible(f, fields, answers)) continue;
    const a = answers[f.key];
    if (Array.isArray(a)) {
      const list = a.map((v) => v.trim()).filter(Boolean);
      if (list.length) out[f.key] = list;
    } else if (typeof a === "string" && a.trim()) {
      out[f.key] = f.type === "PHONE" ? (normalizePhone(a) ?? a.trim()) : a.trim();
    }
  }
  return out;
}

/** An answer as one line of text, for the inbox, emails and exports. */
export function formatAnswer(a: unknown): string {
  if (Array.isArray(a)) return a.join(", ");
  if (a === "yes") return "Yes";
  return typeof a === "string" ? a : "";
}

/** The person's first name, from the first field that looks like their name — for staff texts. */
export function firstNameFrom(fields: { key: string; label: string; type: string; clientField?: string | null }[], answers: Record<string, unknown>): string | null {
  const nameField =
    fields.find((f) => f.clientField === "name") ??
    fields.find((f) => f.type === "TEXT" && /\b(first\s*name|full\s*name|your\s*name|name)\b/i.test(f.label));
  const raw = nameField ? answers[nameField.key] : undefined;
  if (typeof raw !== "string") return null;
  const first = raw.trim().split(/\s+/)[0];
  return first ? first.slice(0, 30) : null;
}

export type FieldSnapshot = { key: string; label: string; type: string };
