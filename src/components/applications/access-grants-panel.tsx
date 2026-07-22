"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addAccessGrant, updateAccessGrant, removeAccessGrant } from "@/lib/actions/access-grants";

type Grant = {
  id: string;
  permission: "VIEW" | "EDIT";
  user: { id: string; name: string; email: string };
};

type GrantableUser = { id: string; name: string; email: string };

const PERMISSION_LABELS = { VIEW: "Can view", EDIT: "Can edit" } as const;

export function AccessGrantsPanel({
  applicationId,
  grants,
  grantableUsers,
  canManage,
}: {
  applicationId: string;
  grants: Grant[];
  grantableUsers: GrantableUser[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedUserId, setSelectedUserId] = useState<string>(grantableUsers[0]?.id ?? "");
  const [selectedPermission, setSelectedPermission] = useState<"VIEW" | "EDIT">("VIEW");

  function handleAdd() {
    if (!selectedUserId) {
      toast.error("Pick someone to share with");
      return;
    }
    const formData = new FormData();
    formData.set("userId", selectedUserId);
    formData.set("permission", selectedPermission);
    startTransition(async () => {
      try {
        await addAccessGrant(applicationId, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to share");
      }
    });
  }

  function handlePermissionChange(grantId: string, permission: "VIEW" | "EDIT") {
    startTransition(async () => {
      try {
        await updateAccessGrant(grantId, applicationId, permission);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update");
      }
    });
  }

  function handleRemove(grantId: string) {
    startTransition(async () => {
      try {
        await removeAccessGrant(grantId, applicationId);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove");
      }
    });
  }

  return (
    <div className="space-y-3">
      {canManage && grantableUsers.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            items={Object.fromEntries(grantableUsers.map((u) => [u.id, `${u.name} (${u.email})`]))}
            value={selectedUserId}
            onValueChange={(v) => setSelectedUserId(v ?? "")}
          >
            <SelectTrigger size="sm" className="flex-1">
              <SelectValue placeholder="Choose a user" />
            </SelectTrigger>
            <SelectContent>
              {grantableUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={PERMISSION_LABELS}
            value={selectedPermission}
            onValueChange={(v) => setSelectedPermission((v ?? "VIEW") as "VIEW" | "EDIT")}
          >
            <SelectTrigger size="sm" className="w-[8.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VIEW">Can view</SelectItem>
              <SelectItem value="EDIT">Can edit</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd}>
            Share
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Access</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Not shared with anyone
                </TableCell>
              </TableRow>
            )}
            {grants.map((grant) => (
              <TableRow key={grant.id}>
                <TableCell>
                  <div>{grant.user.name}</div>
                  <div className="text-xs text-muted-foreground">{grant.user.email}</div>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <Select
                      items={PERMISSION_LABELS}
                      value={grant.permission}
                      onValueChange={(v) => handlePermissionChange(grant.id, (v ?? "VIEW") as "VIEW" | "EDIT")}
                    >
                      <SelectTrigger size="sm" className="w-[8.5rem]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIEW">Can view</SelectItem>
                        <SelectItem value="EDIT">Can edit</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-muted-foreground">{PERMISSION_LABELS[grant.permission]}</span>
                  )}
                </TableCell>
                <TableCell>
                  {canManage && (
                    <Button variant="ghost" size="icon-sm" onClick={() => handleRemove(grant.id)}>
                      <X className="size-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
