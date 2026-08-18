import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getClient, getClientAuditLog, archiveClient, restoreClient } from "@/lib/actions/clients";
import { listAssignableUsers } from "@/lib/actions/applications";
import { listClientNotes } from "@/lib/actions/notes";
import { listMcoCredentialsForClient, listReachableMcoStages } from "@/lib/actions/mco";
import { listClientCredentials } from "@/lib/actions/client-credentials";
import { listPipelineStages } from "@/lib/actions/stage";
import { ClientDetailsForm } from "@/components/clients/client-details-form";
import { ClientNotesPanel } from "@/components/clients/client-notes-panel";
import { McoCredentialsCard } from "@/components/clients/mco-credentials-card";
import { ClientCredentialsCard } from "@/components/clients/client-credentials-card";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { ArchiveButton } from "@/components/shared/archive-button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ServicePill } from "@/components/shared/service-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { STATUS_BADGE_VARIANT, STATUS_LABELS, ApplicationStatus } from "@/lib/status";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let client;
  try {
    client = await getClient(id);
  } catch {
    notFound();
  }

  const [assignableUsers, notes, auditLog, session, mcoCredentials, credentials, mcoStages] = await Promise.all([
    listAssignableUsers(),
    listClientNotes(id),
    getClientAuditLog(id),
    auth(),
    listMcoCredentialsForClient(id),
    listClientCredentials(id),
    listPipelineStages("MCO", { includeExit: true }),
  ]);
  const canArchive = session?.user?.role === "ADMIN" || session?.user?.role === "MANAGER";
  const mcoCredentialsWithStages = await Promise.all(
    mcoCredentials.map(async (c) => ({ ...c, reachableStages: await listReachableMcoStages(c.id) }))
  );

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/clients" />}>Clients</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{client.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {client.name}
            {!client.active && (
              <Badge variant="outline" className="ml-2 align-middle">
                Archived
              </Badge>
            )}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span className="text-sm">Part of</span>
            {client.projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="transition-opacity hover:opacity-80">
                <ServicePill label={project.name} service={project.serviceType} />
              </Link>
            ))}
          </div>
        </div>
        {canArchive && (
          <ArchiveButton
            id={client.id}
            label={client.name}
            archived={!client.active}
            archiveAction={archiveClient}
            restoreAction={restoreClient}
            variant="full"
          />
        )}
      </div>

      <ClientDetailsForm
        clientId={id}
        defaultValues={{
          name: client.name,
          contactInfo: client.contactInfo,
          address: client.address,
          businessName: client.businessName,
          businessPhone: client.businessPhone,
          businessEmail: client.businessEmail,
          ownerName: client.ownerName,
          ownerEmail: client.ownerEmail,
          ownerPhone: client.ownerPhone,
          ownerDateOfBirth: client.ownerDateOfBirth,
        }}
      />

      <Card>
        <CardContent>
          <h2 className="mb-3 text-base font-medium">Cases</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.applications.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No cases for this client yet.
                  </TableCell>
                </TableRow>
              )}
              {client.applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">
                    <Link href={`/applications/${app.id}`} className="hover:underline">
                      {app.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {app.stage ? (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: app.stage.hex, color: "#fff" }}
                        title={app.stage.name}
                      >
                        {app.stage.abbrev}
                      </span>
                    ) : (
                      <Badge variant={STATUS_BADGE_VARIANT[app.status as ApplicationStatus]}>
                        {STATUS_LABELS[app.status as ApplicationStatus]}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <McoCredentialsCard clientId={id} credentials={mcoCredentialsWithStages} mcoStages={mcoStages} />

      <ClientCredentialsCard clientId={id} credentials={credentials} />

      <Card>
        <CardContent>
          <Tabs defaultValue="notes">
            <TabsList>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="audit">Audit Log</TabsTrigger>
            </TabsList>
            <TabsContent value="notes">
              <ClientNotesPanel clientId={id} notes={notes} mentionableUsers={assignableUsers} />
            </TabsContent>
            <TabsContent value="audit">
              <div className="max-h-[32rem] overflow-y-auto pr-1">
                <AuditLogPanel
                  auditLog={auditLog}
                  users={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
