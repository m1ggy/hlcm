import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requireRole, isManagement } from "@/lib/rbac";
import { db } from "@/lib/db";
import { listFormTemplates } from "@/lib/actions/form-templates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IntakeTabs } from "@/components/forms/intake-tabs";
import { FormRowActions } from "@/components/forms/form-row-actions";

// Forms (docs/forms-plan.md): every intake form, with its link, how many
// people filled it in, and quick actions. Managers and admins create and
// edit them; everyone who reviews submissions can copy a link.
export default async function FormsListPage() {
  const session = await requireRole(["ADMIN", "MANAGER", "STAFF"]);
  const canManage = isManagement(session.user.role);
  const [templates, pending] = await Promise.all([listFormTemplates(), db.formSubmission.count({ where: { status: "PENDING" } })]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Forms</h1>
          <IntakeTabs current="forms" pending={pending} />
        </div>
        {canManage && (
          <Button nativeButton={false} render={<Link href="/intake/forms/new" />}>
            <Plus className="size-4" /> New form
          </Button>
        )}
      </div>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <FileText className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-heading text-lg font-semibold">No forms yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Build an intake form once, then share its link or QR code anywhere. People fill it in without an account, and you get notified.
          </p>
          {canManage && (
            <Button nativeButton={false} render={<Link href="/intake/forms/new" />}>
              <Plus className="size-4" /> Create your first form
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => {
            const questions = t.fields.filter((f) => f.type !== "HEADING" && f.type !== "PARAGRAPH").length;
            return (
              <li key={t.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {canManage ? (
                      <Link href={`/intake/forms/${t.id}`} className="font-medium underline-offset-4 hover:underline">
                        {t.name}
                      </Link>
                    ) : (
                      <p className="font-medium">{t.name}</p>
                    )}
                    {t.description && <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                  </div>
                  <Badge variant={t.active ? "default" : "secondary"}>{t.active ? "Live" : "Off"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {questions} {questions === 1 ? "question" : "questions"} ·{" "}
                  <Link href={`/intake?form=${t.id}&status=all`} className="underline-offset-4 hover:underline">
                    {t._count.submissions} {t._count.submissions === 1 ? "submission" : "submissions"}
                  </Link>{" "}
                  · /forms/{t.slug}
                </p>
                <FormRowActions id={t.id} slug={t.slug} name={t.name} active={t.active} canManage={canManage} hasSubmissions={t._count.submissions > 0} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
