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
import { listApplicableTemplates, listGeneratedDocuments } from "@/lib/actions/generated-documents";
import { getMySignatureProfile } from "@/lib/actions/signatures";
import { listNotes } from "@/lib/actions/notes";
import { ApplicationPropertiesTable } from "@/components/applications/application-properties-table";
import { NotesPanel } from "@/components/applications/notes-panel";
import { RecentApplicationTracker } from "@/components/applications/recent-application-tracker";
import { FavoriteStar } from "@/components/applications/favorite-star";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { FilePool } from "@/components/applications/file-pool";
import { AccessGrantsPanel } from "@/components/applications/access-grants-panel";
import { DocumentGenerator } from "@/components/applications/document-generator";
import { GeneratedDocumentsTable } from "@/components/applications/generated-documents-table";
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

  const [
    clients,
    assignableUsers,
    auditLog,
    taskData,
    files,
    accessGrants,
    applicableTemplates,
    generatedDocuments,
    signatureProfile,
    notes,
  ] = await Promise.all([
    listClients(),
    listAssignableUsers(),
    getApplicationAuditLog(id),
    listTasksForApplication(id),
    listFiles(id),
    listAccessGrants(id),
    listApplicableTemplates(id),
    listGeneratedDocuments(id),
    getMySignatureProfile(),
    listNotes(id),
  ]);

  const clientLookup = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const userLookup = Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-6">
      <RecentApplicationTracker id={id} name={application.name} />
      <div className="flex items-center justify-between">
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
        <FavoriteStar applicationId={id} />
      </div>

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
              currentUserId={session.user.id}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 min-w-0">
          <CardContent className="min-w-0">
            <Tabs defaultValue="details" orientation="horizontal" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
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
                <FilePool
                  applicationId={id}
                  files={files}
                  canEdit={canEdit}
                  hasSavedSignature={!!signatureProfile}
                />
              </TabsContent>
              <TabsContent value="documents" className="space-y-4">
                {canEdit && <DocumentGenerator applicationId={id} templates={applicableTemplates} />}
                <GeneratedDocumentsTable applicationId={id} documents={generatedDocuments} canEdit={canEdit} />
              </TabsContent>
              <TabsContent value="comments">
                <NotesPanel applicationId={id} notes={notes} mentionableUsers={assignableUsers} />
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
