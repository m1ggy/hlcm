import Link from "next/link";
import { listFormSubmissions } from "@/lib/actions/form-submissions";
import { listClients } from "@/lib/actions/clients";
import { listProjects } from "@/lib/actions/projects";
import { FormSubmissionsInbox } from "@/components/admin/form-submissions-inbox";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { blockCaregiverRoute } from "@/lib/rbac";

export default async function FormSubmissionsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await blockCaregiverRoute();
  const { status } = await searchParams;
  const filterStatus = status === "all" ? undefined : ((status as "PENDING" | "REVIEWED" | "DISMISSED" | undefined) ?? "PENDING");

  const [submissions, clients, projects] = await Promise.all([
    listFormSubmissions(filterStatus),
    listClients(),
    listProjects(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">Form Submissions</h1>
        <PageInfoButton title="Form Submissions">
          <p>
            Every submission to any of your{" "}
            <Link href="/admin/forms" className="underline">
              forms
            </Link>{" "}
            lands here first — nothing becomes a client automatically. Review each one, then either create a new
            client from it, attach it to a client that already exists, or dismiss it if it&apos;s spam or a
            duplicate.
          </p>
        </PageInfoButton>
      </div>
      <FormSubmissionsInbox
        submissions={submissions.map((s) => ({ ...s, answers: (s.answers ?? {}) as Record<string, string> }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        currentFilter={filterStatus ?? "all"}
      />
    </div>
  );
}
