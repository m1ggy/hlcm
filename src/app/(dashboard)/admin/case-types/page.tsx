import { listCaseTypes } from "@/lib/actions/case-types";
import { blockCaregiverRoute } from "@/lib/rbac";
import { NewCaseTypeDialog } from "@/components/admin/new-case-type-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function CaseTypesPage() {
  await blockCaregiverRoute();
  const caseTypes = await listCaseTypes();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Case Types</h1>
        <NewCaseTypeDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {caseTypes.map((ct) => (
            <TableRow key={ct.id}>
              <TableCell className="font-medium">{ct.name}</TableCell>
              <TableCell>{ct.description ?? "—"}</TableCell>
            </TableRow>
          ))}
          {caseTypes.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground">
                No case types yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
