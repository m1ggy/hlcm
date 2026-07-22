"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createApplication } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name: string };

const NONE = "__none__";

export function NewApplicationDialog({
  clients,
  assignableUsers,
  licenseTypes,
  caseTypes,
  currentUserId,
}: {
  clients: Option[];
  assignableUsers: Option[];
  licenseTypes: Option[];
  caseTypes: Option[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState("");
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);
  const [licenseTypeId, setLicenseTypeId] = useState(NONE);
  const [caseTypeId, setCaseTypeId] = useState(NONE);

  function handleSubmit(formData: FormData) {
    formData.set("clientId", clientId);
    formData.set("assignedUserId", assignedUserId);
    if (licenseTypeId !== NONE) formData.set("licenseTypeTemplateId", licenseTypeId);
    if (caseTypeId !== NONE) formData.set("caseTypeId", caseTypeId);
    startTransition(async () => {
      try {
        await createApplication(formData);
        toast.success("Application created");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create application");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New Application</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Application</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Client</Label>
            <Select
              items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
              value={clientId}
              onValueChange={(v) => setClientId(v ?? "")}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Application name</Label>
            <Input id="name" name="name" required placeholder="e.g. CILA Renewal" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>License type (optional)</Label>
              <Select
                items={{ [NONE]: "None", ...Object.fromEntries(licenseTypes.map((l) => [l.id, l.name])) }}
                value={licenseTypeId}
                onValueChange={(v) => setLicenseTypeId(v ?? NONE)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {licenseTypes.map((lt) => (
                    <SelectItem key={lt.id} value={lt.id}>
                      {lt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Case type (optional)</Label>
              <Select
                items={{ [NONE]: "None", ...Object.fromEntries(caseTypes.map((c) => [c.id, c.name])) }}
                value={caseTypeId}
                onValueChange={(v) => setCaseTypeId(v ?? NONE)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {caseTypes.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>
                      {ct.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {caseTypeId !== NONE && (
            <p className="text-xs text-muted-foreground">
              Matching checklist template items will be added to this Application automatically.
            </p>
          )}
          <div className="space-y-1">
            <Label>Assigned to</Label>
            <Select
              items={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
              value={assignedUserId}
              onValueChange={(v) => setAssignedUserId(v ?? "")}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a staff member" />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={isPending || !clientId}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
