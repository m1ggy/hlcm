"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The "…" next to a header's main buttons: report exports, then an
 * optional archive/restore. `archive.action` may throw or return an
 * ActionResult — both are handled.
 */
export function MoreMenu({
  exportHref,
  archive,
}: {
  exportHref: string;
  archive?: {
    archived: boolean;
    label: string;
    action: () => Promise<unknown>;
  };
}) {
  const [isPending, startTransition] = useTransition();

  function runArchive() {
    if (!archive) return;
    if (!archive.archived && !confirm(`Archive "${archive.label}"?`)) return;
    startTransition(async () => {
      try {
        const result = (await archive.action()) as { ok?: boolean; error?: string } | undefined;
        if (result && result.ok === false) toast.error(result.error ?? "Something went wrong");
        else toast.success(archive.archived ? "Restored" : "Archived");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="icon" aria-label="More actions" disabled={isPending}>
            <MoreHorizontal className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Export report</DropdownMenuLabel>
          <DropdownMenuItem render={<a href={`${exportHref}?format=xlsx`} />}>Excel (.xlsx)</DropdownMenuItem>
          <DropdownMenuItem render={<a href={`${exportHref}?format=pdf`} />}>PDF</DropdownMenuItem>
          <DropdownMenuItem render={<a href={`${exportHref}?format=csv`} />}>CSV</DropdownMenuItem>
        </DropdownMenuGroup>
        {archive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant={archive.archived ? "default" : "destructive"} onClick={runArchive}>
              {archive.archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
