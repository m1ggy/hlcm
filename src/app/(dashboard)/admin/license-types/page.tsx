import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { getPipelineConfig } from "@/lib/actions/pipelines";
import { NewLicenseTypeDialog } from "@/components/admin/new-license-type-dialog";
import { LicenseTypePipelineSelect } from "@/components/admin/license-type-pipeline-select";
import { PipelineSettingsForm } from "@/components/admin/pipeline-settings-form";
import { ForbiddenError, blockCaregiverRoute, isAdmin } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function LicenseTypesPage() {
  await blockCaregiverRoute();
  let licenseTypes;
  try {
    licenseTypes = await listLicenseTypes();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  const session = await auth();
  const canEdit = isAdmin(session?.user?.role);
  const { settings, labels, visible } = await getPipelineConfig();
  const options = visible.map((p) => ({ value: p, label: labels[p] }));
  // A license type on a hidden pipeline (possible only before hiding was
  // guarded) still shows its pipeline's name in its own picker.
  const optionsFor = (pipeline: keyof typeof labels) =>
    options.some((o) => o.value === pipeline) ? options : [...options, { value: pipeline, label: labels[pipeline] }];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">License Types</h1>
        {canEdit && <NewLicenseTypeDialog pipelines={options} />}
      </div>
      <PipelineSettingsForm settings={settings} canEdit={canEdit} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-56">Pipeline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licenseTypes.map((lt) => (
            <TableRow key={lt.id}>
              <TableCell className="font-medium">{lt.name}</TableCell>
              <TableCell>{lt.description ?? "—"}</TableCell>
              <TableCell>
                {canEdit ? (
                  <LicenseTypePipelineSelect id={lt.id} value={lt.pipeline} pipelines={optionsFor(lt.pipeline)} />
                ) : (
                  labels[lt.pipeline]
                )}
              </TableCell>
            </TableRow>
          ))}
          {licenseTypes.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No license types yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
