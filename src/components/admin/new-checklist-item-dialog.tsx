"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createChecklistItemTemplate } from "@/lib/actions/checklist-templates";
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

const ROLES = ["ADMIN", "MANAGER", "STAFF", "CLIENT"] as const;
const NONE = "__none__";

export function NewChecklistItemDialog({
  licenseTypes,
  caseTypes,
}: {
  licenseTypes: Option[];
  caseTypes: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [licenseTypeId, setLicenseTypeId] = useState(NONE);
  const [caseTypeId, setCaseTypeId] = useState("");
  const [defaultRole, setDefaultRole] = useState(NONE);

  function handleSubmit(formData: FormData) {
    if (licenseTypeId !== NONE) formData.set("licenseTypeTemplateId", licenseTypeId);
    formData.set("caseTypeId", caseTypeId);
    if (defaultRole !== NONE) formData.set("defaultRole", defaultRole);
    startTransition(async () => {
      try {
        await createChecklistItemTemplate(formData);
        toast.success("Checklist item added");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add checklist item");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New Checklist Item</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Checklist Item</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>License Type (optional)</Label>
            <Select
              items={{ [NONE]: "None — applies regardless of license type", ...Object.fromEntries(licenseTypes.map((l) => [l.id, l.name])) }}
              value={licenseTypeId}
              onValueChange={(v) => setLicenseTypeId(v ?? NONE)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None — applies regardless of license type</SelectItem>
                {licenseTypes.map((lt) => (
                  <SelectItem key={lt.id} value={lt.id}>
                    {lt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Case Type</Label>
            <Select
              items={Object.fromEntries(caseTypes.map((c) => [c.id, c.name]))}
              value={caseTypeId}
              onValueChange={(v) => setCaseTypeId(v ?? "")}
              required
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a case type" />
              </SelectTrigger>
              <SelectContent>
                {caseTypes.map((ct) => (
                  <SelectItem key={ct.id} value={ct.id}>
                    {ct.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" required placeholder="e.g. Submit Fire Inspection Cert" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="phaseName">Phase (optional)</Label>
            <Input id="phaseName" name="phaseName" placeholder="e.g. Phase 1 — leave blank for a flat checklist" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Default role (optional)</Label>
              <Select
                items={{ [NONE]: "None", ...Object.fromEntries(ROLES.map((r) => [r, r])) }}
                value={defaultRole}
                onValueChange={(v) => setDefaultRole(v ?? NONE)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">Sort order</Label>
              <Input id="sortOrder" name="sortOrder" type="number" defaultValue={0} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isPending || !caseTypeId}>
            {isPending ? "Adding..." : "Add"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
