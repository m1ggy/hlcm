import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getClientAuditLog } from "@/lib/actions/clients";
import { listAssignableUsers } from "@/lib/actions/applications";
import { listClientNotes } from "@/lib/actions/notes";
import { ClientDetailsForm } from "@/components/clients/client-details-form";
import { ClientNotesPanel } from "@/components/clients/client-notes-panel";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const [assignableUsers, notes, auditLog] = await Promise.all([
    listAssignableUsers(),
    listClientNotes(id),
    getClientAuditLog(id),
  ]);

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

      <div>
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        <p className="text-muted-foreground">
          Part of{" "}
          <Link href={`/projects/${client.projectId}`} className="hover:underline">
            {client.project.name}
          </Link>
        </p>
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
                    <Badge variant={STATUS_BADGE_VARIANT[app.status as ApplicationStatus]}>
                      {STATUS_LABELS[app.status as ApplicationStatus]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                <AuditLogPanel auditLog={auditLog} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
