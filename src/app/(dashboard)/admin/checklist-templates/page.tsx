import { listChecklistItemTemplates } from "@/lib/actions/checklist-templates";
import { listLicenseTypes } from "@/lib/actions/license-types";
import { listCaseTypes } from "@/lib/actions/case-types";
import { NewChecklistItemDialog } from "@/components/admin/new-checklist-item-dialog";
import { DeleteChecklistItemButton } from "@/components/admin/delete-checklist-item-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ChecklistTemplatesPage() {
  const [items, licenseTypes, caseTypes] = await Promise.all([
    listChecklistItemTemplates(),
    listLicenseTypes(),
    listCaseTypes(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Checklist Templates</h1>
          <p className="text-muted-foreground">
            These items get cloned onto a new Application when it&apos;s created with a matching license type + case
            type combo.
          </p>
        </div>
        <NewChecklistItemDialog licenseTypes={licenseTypes} caseTypes={caseTypes} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Case Type</TableHead>
            <TableHead>License Type</TableHead>
            <TableHead>Phase</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Sort</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.caseType.name}</TableCell>
              <TableCell>{item.licenseTypeTemplate?.name ?? "Any"}</TableCell>
              <TableCell>{item.phaseName ?? "—"}</TableCell>
              <TableCell className="font-medium">{item.label}</TableCell>
              <TableCell>{item.sortOrder}</TableCell>
              <TableCell>
                <DeleteChecklistItemButton id={item.id} />
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No checklist items yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
