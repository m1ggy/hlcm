import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listDocumentTemplates } from "@/lib/actions/document-templates";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { NewDocumentTemplateDialog } from "@/components/admin/new-document-template-dialog";
import { DocumentTemplateRowActions } from "@/components/admin/document-template-row-actions";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Badge } from "@/components/ui/badge";
import { ForbiddenError } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function DocumentTemplatesPage() {
  const session = await auth();
  const canManage = session?.user?.role === "ADMIN";

  let templates, licenseTypes;
  try {
    [templates, licenseTypes] = await Promise.all([listDocumentTemplates(), listLicenseTypes()]);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Document Templates</h1>
          <PageInfoButton title="Document Templates">
            <p>
              Master copies of the letters and notices you send clients — a renewal notice, a welcome packet,
              anything reused across cases.
            </p>
            <p>
              Upload the file once and mark which details should fill in automatically. Staff can then generate a
              finished, filled-in copy for any matching case from that case&apos;s Documents tab.
            </p>
          </PageInfoButton>
        </div>
        <NewDocumentTemplateDialog licenseTypes={licenseTypes} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Applies To</TableHead>
            <TableHead>Fields</TableHead>
            <TableHead>Used</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <div className="font-medium">{t.name}</div>
                {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
              </TableCell>
              <TableCell>
                {t.licenseTypeTemplate ? (
                  <Badge variant="outline">{t.licenseTypeTemplate.name}</Badge>
                ) : (
                  <span className="text-muted-foreground">Any license type</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.fields.length} field{t.fields.length === 1 ? "" : "s"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t._count.generatedDocuments} time{t._count.generatedDocuments === 1 ? "" : "s"}
              </TableCell>
              <TableCell>
                <DocumentTemplateRowActions
                  templateId={t.id}
                  templateName={t.name}
                  fields={t.fields}
                  canManage={canManage}
                />
              </TableCell>
            </TableRow>
          ))}
          {templates.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No document templates yet — upload one to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
