import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getApplication,
  getApplicationAuditLog,
  listAssignableUsers,
  archiveApplication,
  restoreApplication,
} from "@/lib/actions/applications";
import { listClients } from "@/lib/actions/clients";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { listCaseTypes } from "@/lib/actions/case-types";
import { listTasksForApplication } from "@/lib/actions/tasks";
import { listFiles } from "@/lib/actions/files";
import { listAccessGrants, listGrantableUsers } from "@/lib/actions/access-grants";
import { listApplicableTemplates, listGeneratedDocuments } from "@/lib/actions/generated-documents";
import { getMySignatureProfile } from "@/lib/actions/signatures";
import { listNotes } from "@/lib/actions/notes";
import { listReachableStages, listPipelineStages, listAllStageNames } from "@/lib/actions/stage";
import { ApplicationPropertiesTable } from "@/components/applications/application-properties-table";
import { ClientSummaryCard } from "@/components/applications/client-summary-card";
import { NotesPanel } from "@/components/applications/notes-panel";
import { RecentApplicationTracker } from "@/components/applications/recent-application-tracker";
import { FavoriteStar } from "@/components/applications/favorite-star";
import { ApplicationFlags } from "@/components/applications/application-flags";
import { ArchiveButton } from "@/components/shared/archive-button";
import { Badge } from "@/components/ui/badge";
import { computeReadyToSubmit, computeStaleDays } from "@/lib/application-flags";
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";
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
  const canArchive = session.user.role === "ADMIN" || session.user.role === "MANAGER";
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
    reachableStages,
    forwardStages,
    licenseTypes,
    caseTypes,
    stageLookup,
  ] = await Promise.all([
    listClients({ filter: "all" }),
    listAssignableUsers(),
    getApplicationAuditLog(id),
    listTasksForApplication(id),
    listFiles(id),
    listAccessGrants(id),
    listApplicableTemplates(id),
    listGeneratedDocuments(id),
    getMySignatureProfile(),
    listNotes(id),
    listReachableStages(id),
    application.pipeline ? listPipelineStages(application.pipeline) : Promise.resolve([]),
    listLicenseTypes(),
    listCaseTypes(),
    listAllStageNames(),
  ]);

  const stepIndex = application.stage ? forwardStages.findIndex((s) => s.id === application.stage!.id) : -1;
  const stepInfo = stepIndex === -1 ? null : { index: stepIndex + 1, total: forwardStages.length };

  const clientLookup = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const userLookup = Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]));
  const licenseTypeLookup = Object.fromEntries(licenseTypes.map((l) => [l.id, l.name]));
  const caseTypeLookup = Object.fromEntries(caseTypes.map((c) => [c.id, c.name]));

  const allTaskStatuses = taskData.tasks.flatMap((t) => [t.status, ...t.subtasks.map((s) => s.status)]);
  const taskProgress = {
    total: allTaskStatuses.length,
    done: allTaskStatuses.filter((s) =>
      TASK_CLOSED_STATUSES.includes(s as (typeof TASK_CLOSED_STATUSES)[number])
    ).length,
  };
  const statusSince = auditLog.find((entry) => entry.field === "status")?.createdAt ?? application.createdAt;
  const readyToSubmit = computeReadyToSubmit(application.status, taskProgress);
  const staleDays = computeStaleDays(application.status, statusSince);

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
        <div className="flex items-center gap-2">
          {!application.active && <Badge variant="outline">Archived</Badge>}
          <ApplicationFlags readyToSubmit={readyToSubmit} staleDays={staleDays} />
          <FavoriteStar applicationId={id} />
          {canArchive && (
            <ArchiveButton
              id={id}
              label={application.name}
              archived={!application.active}
              archiveAction={archiveApplication}
              restoreAction={restoreApplication}
              variant="full"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>Checklist</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
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

        <div className="min-w-0 space-y-6 lg:col-span-2">
        <ClientSummaryCard client={application.client} />
        <Card className="min-w-0">
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
                  licenseTypes={licenseTypes}
                  licenseTypeTemplateId={application.licenseTypeTemplateId}
                  caseTypeName={application.caseType?.name ?? null}
                  stage={application.stage}
                  reachableStages={reachableStages}
                  daysInStage={application.daysInStage}
                  stepInfo={stepInfo}
                  defaultValues={{
                    clientId: application.clientId,
                    name: application.name,
                    description: application.description,
                    assignedUserId: application.assignedUserId,
                    assignedManagerId: application.assignedManagerId,
                    status: application.status as ApplicationStatus,
                    agency: application.agency,
                    ballIsWith: application.ballIsWith,
                    correctionRound: application.correctionRound,
                    deficiencyReceivedDate: application.deficiencyReceivedDate,
                    deficiencyResponseDueDate: application.deficiencyResponseDueDate,
                    deficiencyResponseSubmittedDate: application.deficiencyResponseSubmittedDate,
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
                <div className="max-h-[32rem] overflow-y-auto pr-1">
                  <AuditLogPanel
                    auditLog={auditLog}
                    clients={clientLookup}
                    users={userLookup}
                    licenseTypes={licenseTypeLookup}
                    caseTypes={caseTypeLookup}
                    stages={stageLookup}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
