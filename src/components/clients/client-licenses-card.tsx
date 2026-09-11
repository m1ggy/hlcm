"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { createClientLicense, updateClientLicense, deleteClientLicense } from "@/lib/actions/client-licenses";
import { computeLicenseAlerts } from "@/lib/aging-alerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

export type ClientLicense = {
  id: string;
  licenseType: string;
  licenseNumber: string | null;
  issuedDate: Date | null;
  expiryDate: Date;
  status: string | null;
};

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

// Same day-math as the dashboard's License Alerts card and the digest
// email — one rule, three surfaces.
function ExpiryBadge({ expiryDate }: { expiryDate: Date }) {
  const [alert] = computeLicenseAlerts(expiryDate);
  if (!alert) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Expires {new Date(expiryDate).toLocaleDateString()}
      </Badge>
    );
  }
  return <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>{alert.message}</Badge>;
}

function LicenseFields({ defaultValues }: { defaultValues?: ClientLicense }) {
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="client-license-type">License type</Label>
          <Input
            id="client-license-type"
            name="licenseType"
            placeholder="e.g. IDPH Home Care License"
            defaultValue={defaultValues?.licenseType}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-license-number">License number</Label>
          <Input id="client-license-number" name="licenseNumber" defaultValue={defaultValues?.licenseNumber ?? ""} />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="client-license-issued">Issued date</Label>
          <Input id="client-license-issued" name="issuedDate" type="date" defaultValue={toDateInputValue(defaultValues?.issuedDate ?? null)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-license-expiry">Expiry date</Label>
          <Input
            id="client-license-expiry"
            name="expiryDate"
            type="date"
            defaultValue={toDateInputValue(defaultValues?.expiryDate ?? null)}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="client-license-status">Status / notes</Label>
        <Input id="client-license-status" name="status" placeholder="e.g. Renewal in progress" defaultValue={defaultValues?.status ?? ""} />
      </div>
    </>
  );
}

function NewLicenseDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    formData.set("clientId", clientId);
    startTransition(async () => {
      try {
        await createClientLicense(formData);
        toast.success("License added");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add license");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add license</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add license</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <LicenseFields />
          <Button type="submit" className="w-full" loading={isPending}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditLicenseDialog({ license }: { license: ClientLicense }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        await updateClientLicense(license.id, formData);
        toast.success("License updated");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update license");
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7"><Pencil className="size-3.5" /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit license</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <LicenseFields defaultValues={license} />
          <Button type="submit" className="w-full" loading={isPending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteLicenseButton({ license }: { license: ClientLicense }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Remove the "${license.licenseType}" license?`)) return;
    startTransition(async () => {
      try {
        await deleteClientLicense(license.id);
        toast.success("License removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove license");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} loading={isPending}>
      Remove
    </Button>
  );
}

// listClientLicenses already orders soonest-expiring first — renewals that
// need attention next surface at the top without any extra sorting here.
export function ClientLicensesCard({ clientId, licenses }: { clientId: string; licenses: ClientLicense[] }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Licenses &amp; Credentials</h2>
          <NewLicenseDialog clientId={clientId} />
        </div>
        {licenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No licenses on file yet.</p>
        ) : (
          <div className="space-y-2">
            {licenses.map((l) => (
              <div key={l.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{l.licenseType}</span>
                    <ExpiryBadge expiryDate={l.expiryDate} />
                  </div>
                  <div className="flex items-center gap-1">
                    <EditLicenseDialog license={l} />
                    <DeleteLicenseButton license={l} />
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                  {l.licenseNumber && <span>#{l.licenseNumber}</span>}
                  {l.issuedDate && <span>Issued {new Date(l.issuedDate).toLocaleDateString()}</span>}
                </div>
                {l.status && <p className="mt-2 text-sm text-muted-foreground">{l.status}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
