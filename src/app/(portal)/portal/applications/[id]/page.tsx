import { notFound } from "next/navigation";
import Link from "next/link";
import { getApplication } from "@/lib/actions/applications";
import { listTasksForApplication } from "@/lib/actions/tasks";
import { listFiles } from "@/lib/actions/files";
import { listGeneratedDocuments } from "@/lib/actions/generated-documents";
import { PortalChecklist } from "@/components/portal/portal-checklist";
import { PortalFilePool } from "@/components/portal/portal-file-pool";
import { PortalDocumentsList } from "@/components/portal/portal-documents-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { STATUS_BADGE_VARIANT, STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { ForbiddenError, requireSession, getApplicationAccessLevel } from "@/lib/rbac";

export default async function PortalApplicationDetailPage({
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

  const [taskData, files, generatedDocuments] = await Promise.all([
    listTasksForApplication(id),
    listFiles(id),
    listGeneratedDocuments(id),
  ]);

  const sentDocuments = generatedDocuments.filter((doc) => doc.status === "SENT");

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/portal" />}>Your Applications</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{application.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{application.name}</span>
            <Badge variant={STATUS_BADGE_VARIANT[application.status as ApplicationStatus]}>
              {STATUS_LABELS[application.status as ApplicationStatus]}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">License Type: </span>
            {application.licenseTypeTemplate?.name ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Case Type: </span>
            {application.caseType?.name ?? "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="checklist" orientation="horizontal" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="checklist">Checklist</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>
            <TabsContent value="checklist">
              <PortalChecklist
                phases={taskData.phases}
                tasks={taskData.tasks.map((task) => ({
                  ...task,
                  subtasks: task.subtasks.map((subtask) => ({ ...subtask, subtasks: [] })),
                }))}
              />
            </TabsContent>
            <TabsContent value="files">
              <PortalFilePool applicationId={id} files={files} canUpload={accessLevel === "edit"} />
            </TabsContent>
            <TabsContent value="documents">
              <PortalDocumentsList documents={sentDocuments} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
