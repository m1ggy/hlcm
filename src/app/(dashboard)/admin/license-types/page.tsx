import { notFound } from "next/navigation";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { NewLicenseTypeDialog } from "@/components/admin/new-license-type-dialog";
import { ForbiddenError } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function LicenseTypesPage() {
  let licenseTypes;
  try {
    licenseTypes = await listLicenseTypes();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">License Types</h1>
        <NewLicenseTypeDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licenseTypes.map((lt) => (
            <TableRow key={lt.id}>
              <TableCell className="font-medium">{lt.name}</TableCell>
              <TableCell>{lt.description ?? "—"}</TableCell>
            </TableRow>
          ))}
          {licenseTypes.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground">
                No license types yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
