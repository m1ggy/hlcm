"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { createClientOwner, updateClientOwner, deleteClientOwner } from "@/lib/actions/client-owners";
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
import { Card, CardContent } from "@/components/ui/card";

export type ClientOwner = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ownershipPercentage: number | null;
};

function OwnerFields({ defaultValues }: { defaultValues?: ClientOwner }) {
  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1">
          <Label htmlFor="client-owner-name">Name</Label>
          <Input id="client-owner-name" name="name" defaultValue={defaultValues?.name} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-owner-pct">Ownership %</Label>
          <Input
            id="client-owner-pct"
            name="ownershipPercentage"
            type="number"
            min={0}
            max={100}
            step="0.1"
            className="w-24"
            defaultValue={defaultValues?.ownershipPercentage ?? ""}
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="client-owner-email">Email</Label>
          <Input id="client-owner-email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-owner-phone">Phone</Label>
          <Input id="client-owner-phone" name="phone" type="tel" defaultValue={defaultValues?.phone ?? ""} />
        </div>
      </div>
    </>
  );
}

function NewOwnerDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("clientId", clientId);
    startTransition(async () => {
      try {
        await createClientOwner(formData);
        toast.success("Owner added");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add owner");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add owner</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add owner</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <OwnerFields />
          <Button type="submit" className="w-full" loading={isPending}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditOwnerDialog({ owner }: { owner: ClientOwner }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateClientOwner(owner.id, formData);
        toast.success("Owner updated");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update owner");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7"><Pencil className="size-3.5" /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit owner</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <OwnerFields defaultValues={owner} />
          <Button type="submit" className="w-full" loading={isPending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteOwnerButton({ owner }: { owner: ClientOwner }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Remove "${owner.name}" as an owner?`)) return;
    startTransition(async () => {
      try {
        await deleteClientOwner(owner.id);
        toast.success("Owner removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove owner");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} loading={isPending}>
      Remove
    </Button>
  );
}

// Replaces the old single-owner fields on ClientDetailsForm — some
// companies have two or three owners/partners. The running total is
// informational only (not validated against 100) since ownership data is
// often partial or simply unknown for a given client.
export function ClientOwnersCard({ clientId, owners }: { clientId: string; owners: ClientOwner[] }) {
  const total = owners.reduce((sum, o) => sum + (o.ownershipPercentage ?? 0), 0);

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium">Owners</h2>
            {owners.length > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">{total}% accounted for</span>
            )}
          </div>
          <NewOwnerDialog clientId={clientId} />
        </div>
        {owners.length === 0 ? (
          <p className="text-sm text-muted-foreground">No owners on file yet.</p>
        ) : (
          <div className="space-y-2">
            {owners.map((o) => (
              <div key={o.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{o.name}</span>
                    {o.ownershipPercentage != null && (
                      <span className="ml-1.5 text-sm text-muted-foreground tabular-nums">{o.ownershipPercentage}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <EditOwnerDialog owner={o} />
                    <DeleteOwnerButton owner={o} />
                  </div>
                </div>
                {(o.email || o.phone) && (
                  <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    {o.email && (
                      <div>
                        <a href={`mailto:${o.email}`} className="hover:underline">
                          {o.email}
                        </a>
                      </div>
                    )}
                    {o.phone && (
                      <div>
                        <a href={`tel:${o.phone}`} className="hover:underline">
                          {o.phone}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
