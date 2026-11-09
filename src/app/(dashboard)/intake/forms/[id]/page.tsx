import { notFound, redirect } from "next/navigation";
import { requireSession, isManagement } from "@/lib/rbac";
import { db } from "@/lib/db";
import { getFormTemplate } from "@/lib/actions/form-templates";
import { isPlatformSmsConfigured } from "@/lib/sms";
import { parseShowIf, type FormFieldType } from "@/lib/form-logic";
import { FormBuilder, type BuilderTemplate } from "@/components/forms/form-builder";

// Build or edit a form (docs/forms-plan.md, Phase 2). `new` starts a blank one.
export default async function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isManagement(session.user.role)) redirect("/intake/forms");
  const { id } = await params;

  const template = id === "new" ? null : await getFormTemplate(id);
  if (id !== "new" && !template) notFound();

  const people = await db.user.findMany({
    where: { active: true, isSupport: false, assignedFromUserId: null, role: { notIn: ["CLIENT", "CAREGIVER"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true, smsFormAlerts: true, smsOptedOutAt: true },
  });

  const initial: BuilderTemplate = template
    ? {
        id: template.id,
        name: template.name,
        slug: template.slug,
        description: template.description,
        active: template.active,
        thankYouMessage: template.thankYouMessage,
        sendCopyToSubmitter: template.sendCopyToSubmitter,
        notifyUserIds: template.notifyUserIds,
        notifyEmails: template.notifyEmails,
        notifyTextUserIds: template.notifyTextUserIds,
        submissionCount: template._count.submissions,
        fields: template.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type as FormFieldType,
          required: f.required,
          options: f.options,
          clientField: f.clientField,
          helpText: f.helpText,
          placeholder: f.placeholder,
          showIf: parseShowIf(f.showIf),
        })),
      }
    : {
        id: null,
        name: "",
        slug: "",
        description: null,
        active: true,
        thankYouMessage: null,
        sendCopyToSubmitter: false,
        notifyUserIds: [],
        notifyEmails: null,
        notifyTextUserIds: [],
        submissionCount: 0,
        fields: [],
      };

  return (
    <FormBuilder
      key={initial.id ?? "new"}
      initial={initial}
      staff={people.map((p) => ({ id: p.id, name: p.name, canText: Boolean(p.phone && p.smsFormAlerts && !p.smsOptedOutAt) }))}
      textingReady={isPlatformSmsConfigured()}
    />
  );
}
