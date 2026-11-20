"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { setLicenseTypeActive, updateLicenseType } from "@/lib/actions/license-types";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function EditLicenseTypeDialog({
  licenseType,
}: {
  licenseType: { id: string; name: string; description: string | null; active: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(licenseType.name);
  const [description, setDescription] = useState(licenseType.description ?? "");
  const [isSaving, startSaving] = useTransition();
  const [isToggling, startToggling] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(licenseType.name);
      setDescription(licenseType.description ?? "");
    }
    setOpen(next);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    startSaving(async () => {
      try {
        const result = await updateLicenseType(licenseType.id, { name, description });
        if (!result.ok) return void toast.error(result.error);
        toast.success("License type saved");
        setOpen(false);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save the license type"));
      }
    });
  }

  function toggleActive() {
    startToggling(async () => {
      try {
        const result = await setLicenseTypeActive(licenseType.id, !licenseType.active);
        if (!result.ok) return void toast.error(result.error);
        toast.success(licenseType.active ? "License type retired" : "License type restored");
        setOpen(false);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't change the license type"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title={`Edit ${licenseType.name}`}>
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit license type</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor={`lt-name-${licenseType.id}`}>Name</Label>
            <Input id={`lt-name-${licenseType.id}`} value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
            <p className="text-xs text-muted-foreground">Every case with this license type shows the new name.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`lt-desc-${licenseType.id}`}>Description</Label>
            <Input id={`lt-desc-${licenseType.id}`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </div>
          <Button type="submit" className="w-full" loading={isSaving} disabled={!name.trim() || isToggling}>
            Save
          </Button>
        </form>
        <div className="space-y-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {licenseType.active
              ? "Retiring it stops it being offered for new cases and templates. Cases that already have it keep it."
              : "Retired: not offered for new cases. Restore it to offer it again."}
          </p>
          <Button variant="outline" className="w-full" onClick={toggleActive} loading={isToggling} disabled={isSaving}>
            {licenseType.active ? "Retire license type" : "Restore license type"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
