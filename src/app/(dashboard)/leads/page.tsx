import { listLeads } from "@/lib/actions/leads";
import { listClients } from "@/lib/actions/clients";
import { listProjects } from "@/lib/actions/projects";
import { listAssignableUsers } from "@/lib/actions/applications";
import { LeadsInbox } from "@/components/leads/leads-inbox";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { blockCaregiverRoute } from "@/lib/rbac";
import type { $Enums } from "@/generated/prisma/client";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  await blockCaregiverRoute();
  const { stage } = await searchParams;
  const filterStage = stage === "all" ? undefined : ((stage as $Enums.LeadStage | undefined) ?? "BOOKED");

  const [leads, clients, projects, assignableUsers] = await Promise.all([
    listLeads(filterStage),
    listClients(),
    listProjects(),
    listAssignableUsers(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <PageInfoButton title="Leads">
          <p>
            Every new booking on Calendly lands here first — nothing becomes a client automatically. Review each one,
            move it through the pipeline (Booked → Held/No-show/Missed → Follow-up sent → Rebooked → Converted →
            Lost), then either create a new client from it, attach it to a client that already exists, or mark it
            lost. Marking a lead No-show or Missed auto-creates a follow-up task; &quot;Send follow-up&quot; emails a
            one-click rebooking link.
          </p>
        </PageInfoButton>
      </div>
      <LeadsInbox
        leads={leads}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        assignableUsers={assignableUsers.map((u) => ({ id: u.id, name: u.name }))}
        currentFilter={filterStage ?? "all"}
      />
    </div>
  );
}
