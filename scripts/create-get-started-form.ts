// Creates the "Get started" form the public home page links to
// (src/app/home: <ctk workspace>/forms/get-started). A prospective client
// fills it in; it lands in the workspace's intake inbox (/intake) and emails
// its admins like any other form. Safe to run again: an existing form with the
// link "get-started" is left alone — edit it in Intake → Forms instead.
//
//   npx tsx scripts/create-get-started-form.ts            (CTK)
//   ORG_SLUG=acme npx tsx scripts/create-get-started-form.ts
import { db, runScriptAsTenant } from "./lib/tenant-script";

const SLUG = "get-started";
const SOMETHING_ELSE = "Something else";

async function main() {
  const existing = await db.formTemplate.findFirst({ where: { slug: SLUG }, select: { id: true, active: true } });
  if (existing) {
    console.log(`A form with the link "${SLUG}" already exists (${existing.active ? "on" : "off"}) — left as is.`);
    return;
  }

  const owner =
    (await db.user.findFirst({ where: { role: "OWNER", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!owner) throw new Error("No active owner or admin to record as the form's creator");

  const fields = [
    { key: "name", label: "Your name", type: "TEXT", required: true, clientField: "name" },
    { key: "business_name", label: "Business name", type: "TEXT", required: true, clientField: "businessName" },
    { key: "email", label: "Email", type: "EMAIL", required: true, clientField: "businessEmail" },
    { key: "phone", label: "Phone", type: "PHONE", clientField: "businessPhone" },
    {
      key: "team_size",
      label: "How many people at your business would use the workspace?",
      type: "RADIO",
      required: true,
      options: ["Just me", "2–5", "6–15", "16 or more"],
    },
    {
      key: "help_with",
      label: "What would you like help with?",
      type: "MULTI_CHECKBOX",
      required: true,
      helpText: "Pick as many as you like.",
      options: [
        "Admin and office tasks",
        "Bookkeeping and invoices",
        "Scheduling and calendars",
        "Marketing and social media",
        "Customer support",
        SOMETHING_ELSE,
      ],
    },
    {
      key: "help_other",
      label: "What else do you need help with?",
      type: "LONG_TEXT",
      required: true,
      showIf: { key: "help_with", op: "includes", value: SOMETHING_ELSE },
    },
    {
      key: "contact_preference",
      label: "Best way to reach you",
      type: "RADIO",
      options: ["Email", "Phone call", "Text message"],
    },
    {
      key: "details",
      label: "Anything else we should know?",
      type: "LONG_TEXT",
      placeholder: "Deadlines, tools you already use, how you work today…",
    },
  ] as const;

  const form = await db.formTemplate.create({
    data: {
      name: "Get started",
      slug: SLUG,
      description:
        "Tell us a little about your business and what you need. We'll get in touch to set up your workspace and the team that works with you.",
      thankYouMessage: "Thanks! We've got your details and will be in touch within one business day.",
      sendCopyToSubmitter: true,
      createdById: owner.id,
      fields: {
        create: fields.map((f, i) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: "required" in f ? f.required : false,
          options: "options" in f ? [...f.options] : [],
          clientField: "clientField" in f ? f.clientField : null,
          helpText: "helpText" in f ? f.helpText : null,
          placeholder: "placeholder" in f ? f.placeholder : null,
          showIf: "showIf" in f ? { ...f.showIf } : undefined,
          sortOrder: i,
        })),
      },
    },
  });
  console.log(`Created "${form.name}" — /forms/${form.slug}`);
}

runScriptAsTenant(main);
