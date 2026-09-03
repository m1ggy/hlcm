"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { renameClientGroup, deleteClientGroup } from "@/lib/actions/client-groups";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";

export type ClientGroupSummary = { id: string; name: string; clientCount: number };

// Inline-editable name (same auto-save-on-blur pattern as ClientDetailsForm)
// rather than a separate rename dialog — a group is just a name, nothing
// else to fill in. Deleting one never touches its member clients; they
// just revert to showing individually on the Invoices page (see
// deleteClientGroup in src/lib/actions/client-groups.ts).
export function ClientGroupRow({ group }: { group: ClientGroupSummary }) {
  const router = useRouter();
  const [name, setName] = useState(group.name);
  const [isRenaming, startRenaming] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name can't be empty");
      setName(group.name);
      return;
    }
    if (trimmed === group.name) return;
    startRenaming(async () => {
      try {
        await renameClientGroup(group.id, { name: trimmed });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to rename group");
        setName(group.name);
      }
    });
  }

  function handleDelete() {
    const warning =
      group.clientCount > 0
        ? `Delete "${group.name}"? Its ${group.clientCount} client${group.clientCount === 1 ? "" : "s"} will show individually again.`
        : `Delete "${group.name}"?`;
    if (!confirm(warning)) return;
    startDeleting(async () => {
      try {
        await deleteClientGroup(group.id);
        toast.success("Group deleted");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete group");
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          disabled={isRenaming}
          className="h-8 max-w-xs"
        />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {group.clientCount} {group.clientCount === 1 ? "client" : "clients"}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isDeleting}>
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
