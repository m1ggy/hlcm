import { currentOrganization } from "@/lib/db";

// A tasks-only workspace's home (src/lib/workspace-kind.ts). Projects, tasks
// and the weekly summary land here in Phase 2–3 of docs/workspace-tasks-plan.md.
export default async function WorkPage() {
  const org = await currentOrganization();
  return (
    <div className="mx-auto max-w-2xl space-y-2 py-12 text-center">
      <h1 className="text-2xl font-semibold">{org.name}</h1>
      <p className="text-sm text-muted-foreground">Projects, tasks and the weekly summary will appear here.</p>
    </div>
  );
}
