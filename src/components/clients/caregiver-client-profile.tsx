import { notFound } from "next/navigation";
import { getCaregiverClient } from "@/lib/actions/clients";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaregiverTaskRow } from "@/components/tasks/caregiver-task-row";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

// A Caregiver's whole view of a client: read-only business/owner/contact
// info (no billing, no MCO/client credentials, no invoices, no audit log —
// those stay behind requireRole(["ADMIN","MANAGER","STAFF"])/ADMIN-only
// gates this page never even calls) plus their own tasks across that
// client's cases, each editable for status + notes only.
export async function CaregiverClientProfile({ clientId }: { clientId: string }) {
  let client;
  try {
    client = await getCaregiverClient(clientId);
  } catch {
    notFound();
  }

  const tasks = client.applications.flatMap((app) =>
    app.tasks.map((task) => ({ ...task, applicationName: app.name }))
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{client.name}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact" value={client.contactInfo} />
          <Field label="Address" value={client.address} />
          <Field label="Business name" value={client.businessName} />
          <Field label="Business phone" value={client.businessPhone} />
          <Field label="Business email" value={client.businessEmail} />
          <Field label="Owner" value={client.ownerName} />
          <Field label="Owner phone" value={client.ownerPhone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks assigned to you on this client yet.</p>
          ) : (
            tasks.map((task) => <CaregiverTaskRow key={task.id} task={task} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
