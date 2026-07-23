"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bulkUpdateApplications } from "@/lib/actions/applications";
import { FavoriteStar } from "@/components/applications/favorite-star";
import { STATUS_BADGE_VARIANT, STATUS_LABELS, APPLICATION_STATUSES, ApplicationStatus } from "@/lib/status";

type AppRow = {
  id: string;
  name: string;
  status: string;
  client: { name: string };
  assignedUser: { name: string };
};

const NONE = "__none__";

export function ApplicationsTable({
  applications,
  assignableUsers,
  favoriteIds,
  onFavoriteChange,
}: {
  applications: AppRow[];
  assignableUsers: { id: string; name: string }[];
  favoriteIds?: Set<string>;
  onFavoriteChange?: (id: string, isFavorite: boolean) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>(NONE);
  const [bulkAssignee, setBulkAssignee] = useState<string>(NONE);
  const [isPending, startTransition] = useTransition();

  const allSelected = applications.length > 0 && selected.size === applications.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(applications.map((a) => a.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk() {
    if (bulkStatus === NONE && bulkAssignee === NONE) {
      toast.error("Pick a status or assignee to apply");
      return;
    }
    startTransition(async () => {
      try {
        await bulkUpdateApplications({
          ids: [...selected],
          status: bulkStatus === NONE ? undefined : (bulkStatus as ApplicationStatus),
          assignedUserId: bulkAssignee === NONE ? undefined : bulkAssignee,
        });
        toast.success(`Updated ${selected.size} application${selected.size === 1 ? "" : "s"}`);
        setSelected(new Set());
        setBulkStatus(NONE);
        setBulkAssignee(NONE);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Bulk update failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select items={{ [NONE]: "Set status...", ...Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, STATUS_LABELS[s]])) }} value={bulkStatus} onValueChange={(v) => setBulkStatus(v ?? NONE)}>
            <SelectTrigger size="sm" className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Set status...</SelectItem>
              {APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={{ [NONE]: "Reassign to...", ...Object.fromEntries(assignableUsers.map((u) => [u.id, u.name])) }} value={bulkAssignee} onValueChange={(v) => setBulkAssignee(v ?? NONE)}>
            <SelectTrigger size="sm" className="w-[10rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Reassign to...</SelectItem>
              {assignableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={applyBulk} disabled={isPending}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={isPending}>
            Clear
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            </TableHead>
            <TableHead className="w-8" />
            <TableHead>Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Assigned To</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => (
            <TableRow key={app.id} className="relative">
              <TableCell>
                <Checkbox
                  checked={selected.has(app.id)}
                  onCheckedChange={() => toggleOne(app.id)}
                  aria-label={`Select ${app.name}`}
                />
              </TableCell>
              <TableCell>
                <FavoriteStar
                  applicationId={app.id}
                  isFavorite={favoriteIds?.has(app.id)}
                  onToggle={(nowFavorite) => onFavoriteChange?.(app.id, nowFavorite)}
                />
              </TableCell>
              <TableCell className="font-medium">
                <Link href={`/applications/${app.id}`} className="hover:underline">
                  {app.name}
                </Link>
              </TableCell>
              <TableCell>{app.client.name}</TableCell>
              <TableCell>{app.assignedUser.name}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[app.status as ApplicationStatus]}>
                  {STATUS_LABELS[app.status as ApplicationStatus]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {applications.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No applications yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
