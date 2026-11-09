import Link from "next/link";
import { Plus } from "lucide-react";
import { requireRole, isManagement } from "@/lib/rbac";
import { db, currentWorkspaceTimezone } from "@/lib/db";
import { listClients } from "@/lib/actions/clients";
import { listProjects } from "@/lib/actions/projects";
import { formatAnswer, isLayoutField, type FieldSnapshot } from "@/lib/form-logic";
import { Button } from "@/components/ui/button";
import { IntakeTabs } from "@/components/forms/intake-tabs";
import { IntakeInbox, type InboxSubmission } from "@/components/forms/intake-inbox";

// Form submissions (docs/forms-plan.md, Phase 4): everything people sent
// through the forms, newest first — search, filter by form and status, open
// one to read it all and act on it.

const STATUSES = ["PENDING", "REVIEWED", "DISMISSED"] as const;

export default async function IntakePage({ searchParams }: { searchParams: Promise<{ status?: string; form?: string; q?: string; open?: string }> }) {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const sp = await searchParams;
  const status = sp.status === "all" ? null : STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : "PENDING";
  const q = sp.q?.trim().toLowerCase() ?? "";

  const [rows, counts, templates, clients, projects, timeZone] = await Promise.all([
    db.formSubmission.findMany({
      // The one linked from a notification shows even if it's outside the filter.
      where: { OR: [{ ...(status && { status }), ...(sp.form && { templateId: sp.form }) }, ...(sp.open ? [{ id: sp.open }] : [])] },
      include: {
        template: { select: { id: true, name: true, fields: { orderBy: { sortOrder: "asc" }, select: { key: true, label: true, type: true, clientField: true } } } },
        client: { select: { id: true, name: true } },
        reviewedBy: { select: { name: true } },
        files: { select: { id: true, fieldKey: true, fileName: true, sizeBytes: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.formSubmission.groupBy({ by: ["status"], _count: true, ...(sp.form && { where: { templateId: sp.form } }) }),
    db.formTemplate.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    listClients(),
    listProjects(),
    currentWorkspaceTimezone(),
  ]);

  // Texts sent about these submissions ("Texted Ada, Mo").
  const texts = await db.smsLog.findMany({
    where: { entityId: { in: rows.map((r) => r.id) }, purpose: "FORM_SUBMITTED" },
    select: { entityId: true, ok: true, user: { select: { name: true } } },
  });

  const submissions: InboxSubmission[] = rows
    .map((s) => {
      const answers = (s.answers ?? {}) as Record<string, unknown>;
      // Labels as they were when it was filled in; current fields for older submissions.
      const snapshot = (Array.isArray(s.fieldsSnapshot) ? (s.fieldsSnapshot as FieldSnapshot[]) : null) ??
        s.template.fields.filter((f) => !isLayoutField(f.type)).map((f) => ({ key: f.key, label: f.label, type: f.type }));
      const known = new Set(snapshot.map((f) => f.key));
      const items = [
        ...snapshot.filter((f) => f.type !== "FILE").map((f) => ({ key: f.key, label: f.label, value: formatAnswer(answers[f.key]) })),
        ...Object.keys(answers)
          .filter((k) => !known.has(k))
          .map((k) => ({ key: k, label: k.replace(/_/g, " "), value: formatAnswer(answers[k]) })),
      ];
      const defaults: Record<string, string> = {};
      for (const f of s.template.fields) if (f.clientField && typeof answers[f.key] === "string") defaults[f.clientField] = answers[f.key] as string;
      const nameItem = s.template.fields.find((f) => f.clientField === "name") ?? s.template.fields.find((f) => f.type === "TEXT" && /name/i.test(f.label));
      const emailItem = s.template.fields.find((f) => f.type === "EMAIL");
      return {
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        status: s.status,
        form: { id: s.template.id, name: s.template.name },
        from: (nameItem && formatAnswer(answers[nameItem.key])) || (emailItem && formatAnswer(answers[emailItem.key])) || null,
        items,
        files: s.files.map((f) => ({ ...f, label: snapshot.find((x) => x.key === f.fieldKey)?.label ?? f.fieldKey })),
        client: s.client,
        reviewedBy: s.reviewedBy?.name ?? null,
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        note: s.note,
        copyEmailedTo: s.copyEmailedTo,
        texted: texts.filter((t) => t.entityId === s.id && t.ok).map((t) => t.user?.name ?? "someone"),
        defaults,
      };
    })
    .filter((s) => s.id === sp.open || !q || [s.form.name, s.from ?? "", s.note ?? "", ...s.items.map((i) => i.value)].some((v) => v.toLowerCase().includes(q)));

  const count = (st: string) => counts.find((c) => c.status === st)?._count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Forms</h1>
          <IntakeTabs current="submissions" pending={count("PENDING")} />
        </div>
        {isManagement(session.user.role) && (
          <Button variant="outline" nativeButton={false} render={<Link href="/intake/forms/new" />}>
            <Plus className="size-4" /> New form
          </Button>
        )}
      </div>
      <IntakeInbox
        submissions={submissions}
        status={status ?? "all"}
        counts={{ PENDING: count("PENDING"), REVIEWED: count("REVIEWED"), DISMISSED: count("DISMISSED") }}
        forms={templates}
        formId={sp.form ?? null}
        query={sp.q ?? ""}
        openId={sp.open ?? null}
        timeZone={timeZone}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}
