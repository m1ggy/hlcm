"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { assignStaff } from "@/lib/actions/workspaces";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Person = { id: string; name: string; email: string };

export function AssignStaffDialog({
  orgId,
  workspaceName,
  canAddManagers,
  staff,
}: {
  orgId: string;
  workspaceName: string;
  /** Admins only: account managers add staff. */
  canAddManagers: boolean;
  /** Your workspace's people not already assigned here. */
  staff: Person[];
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<"STAFF" | "MANAGER">("STAFF");
  const [canAssign, setCanAssign] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!personId) {
      toast.error("Pick a person");
      return;
    }
    startTransition(async () => {
      const result = await assignStaff({ orgId, homeUserId: personId, role, canAssign: role === "MANAGER" && canAssign });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Assigned to ${workspaceName}`);
      setOpen(false);
      setPersonId("");
      setRole("STAFF");
      setCanAssign(false);
    });
  }

  const people = new Map(staff.map((p) => [p.id, p]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={staff.length === 0}>Assign person</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign to {workspaceName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Person</Label>
            <Select value={personId} onValueChange={(v) => setPersonId(String(v))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick someone">{(v: string) => (v ? people.get(v)?.name : "Pick someone")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {staff.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} <span className="text-muted-foreground">{p.email}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canAddManagers && (
            <>
              <div className="space-y-1">
                <Label>Role in {workspaceName}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "STAFF" | "MANAGER")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string) => (v === "MANAGER" ? "Manager" : "Staff")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role === "MANAGER" && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={canAssign} onCheckedChange={(c) => setCanAssign(c === true)} />
                  <span>
                    Account manager — can add and remove staff for {workspaceName} from this page
                  </span>
                </label>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            They get an account in {workspaceName} under the same name and email, reached from the workspace switcher —
            no new password.
          </p>
          <Button className="w-full" onClick={submit} loading={isPending}>
            Assign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
