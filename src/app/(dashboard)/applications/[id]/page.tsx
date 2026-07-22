import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getApplication,
  getApplicationAuditLog,
  listAssignableUsers,
} from "@/lib/actions/applications";
import { listClients } from "@/lib/actions/clients";
import { listTasksForApplication } from "@/lib/actions/tasks";
import { listFiles } from "@/lib/actions/files";
import { listAccessGrants, listGrantableUsers } from "@/lib/actions/access-grants";
import { ApplicationPropertiesTable } from "@/components/applications/application-properties-table";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { FilePool } from "@/components/applications/file-pool";
import { AccessGrantsPanel } from "@/components/applications/access-grants-panel";
import { TaskBoard } from "@/components/tasks/task-board";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ApplicationStatus } from "@/lib/status";
import { ForbiddenError, requireSession, getApplicationAccessLevel } from "@/lib/rbac";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let application;
  try {
    application = await getApplication(id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  const session = await requireSession();
  const accessLevel = await getApplicationAccessLevel(session, id);
  const canEdit = accessLevel === "edit";
  const grantableUsers = canEdit ? await listGrantableUsers(id) : [];

  const [clients, assignableUsers, auditLog, taskData, files, accessGrants] = await Promise.all([
    listClients(),
    listAssignableUsers(),
    getApplicationAuditLog(id),
    listTasksForApplication(id),
    listFiles(id),
    listAccessGrants(id),
  ]);

  const clientLookup = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const userLookup = Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/applications" />}>Applications</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{application.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskBoard
              applicationId={id}
              phases={taskData.phases}
              tasks={taskData.tasks.map((task) => ({
                ...task,
                subtasks: task.subtasks.map((subtask) => ({ ...subtask, subtasks: [] })),
              }))}
              assignableUsers={assignableUsers}
              defaultAssignedUserId={application.assignedUserId}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 min-w-0">
          <CardContent className="min-w-0">
            <Tabs defaultValue="details" orientation="horizontal" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="sharing">Sharing</TabsTrigger>
                <TabsTrigger value="audit">Audit Log</TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <ApplicationPropertiesTable
                  applicationId={id}
                  clients={clients}
                  assignableUsers={assignableUsers}
                  licenseTypeName={application.licenseTypeTemplate?.name ?? null}
                  caseTypeName={application.caseType?.name ?? null}
                  defaultValues={{
                    clientId: application.clientId,
                    name: application.name,
                    description: application.description,
                    assignedUserId: application.assignedUserId,
                    status: application.status as ApplicationStatus,
                  }}
                />
              </TabsContent>
              <TabsContent value="files">
                <FilePool applicationId={id} files={files} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="sharing">
                <AccessGrantsPanel
                  applicationId={id}
                  grants={accessGrants}
                  grantableUsers={grantableUsers}
                  canManage={canEdit}
                />
              </TabsContent>
              <TabsContent value="audit">
                <AuditLogPanel auditLog={auditLog} clients={clientLookup} users={userLookup} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
