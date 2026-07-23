import { notFound } from "next/navigation";
import { listDocumentTemplates } from "@/lib/actions/document-templates";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { NewDocumentTemplateDialog } from "@/components/admin/new-document-template-dialog";
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
        <h1 className="text-2xl font-semibold">Document Templates</h1>
        <NewDocumentTemplateDialog licenseTypes={licenseTypes} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Applies To</TableHead>
            <TableHead>Fields</TableHead>
            <TableHead>File</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{t.licenseTypeTemplate?.name ?? "Any license type"}</TableCell>
              <TableCell className="text-muted-foreground">{t.fields.length}</TableCell>
              <TableCell className="text-muted-foreground">{t.fileName}</TableCell>
            </TableRow>
          ))}
          {templates.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No document templates yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
