"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, X } from "lucide-react";
import {
  createCareRecipient,
  archiveCareRecipient,
  assignCaregiver,
  unassignCaregiver,
} from "@/lib/actions/care-recipients";
import { mapsLinkForAddress } from "@/lib/geolocation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent } from "@/components/ui/card";

export type CareRecipientRow = {
  id: string;
  name: string;
  address: string | null;
  contactInfo: string | null;
  notes: string | null;
  assignments: { caregiver: { id: string; name: string } }[];
};

function NewCareRecipientDialog({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("clientId", clientId);
    startTransition(async () => {
      try {
        await createCareRecipient(formData);
        toast.success("Care recipient added");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add care recipient");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add care recipient</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a care recipient</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {/* Prefixed ids — this dialog mounts on the same Client detail
              page as ClientDetailsForm, which already owns plain #name/
              #address/#contactInfo ids on its own always-visible,
              save-on-blur inputs. An id collision here isn't just invalid
              HTML, it risks a label click or fill targeting the Client's
              own live-saving field instead of this form's. */}
          <div className="space-y-1">
            <Label htmlFor="care-recipient-name">Name</Label>
            <Input id="care-recipient-name" name="name" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="care-recipient-address">Address</Label>
            <Input id="care-recipient-address" name="address" placeholder="Where a caregiver visits them" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="care-recipient-contactInfo">Contact info</Label>
            <Input id="care-recipient-contactInfo" name="contactInfo" placeholder="Family member, phone, ..." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="care-recipient-notes">Notes</Label>
            <Textarea id="care-recipient-notes" name="notes" rows={2} />
          </div>
          <Button type="submit" className="w-full" loading={isPending}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignCaregiverControl({
  careRecipientId,
  caregivers,
  alreadyAssigned,
}: {
  careRecipientId: string;
  caregivers: { id: string; name: string }[];
  alreadyAssigned: string[];
}) {
  const router = useRouter();
  const [caregiverId, setCaregiverId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const available = caregivers.filter((c) => !alreadyAssigned.includes(c.id));

  function handleAssign() {
    if (!caregiverId) return;
    startTransition(async () => {
      try {
        await assignCaregiver(careRecipientId, caregiverId);
        setCaregiverId("");
        toast.success("Caregiver assigned");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to assign caregiver");
      }
    });
  }

  if (available.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Select
        items={Object.fromEntries(available.map((c) => [c.id, c.name]))}
        value={caregiverId || null}
        onValueChange={(v) => setCaregiverId(v ?? "")}
      >
        <SelectTrigger className="h-7 w-40 text-xs">
          <SelectValue placeholder="Assign caregiver..." />
        </SelectTrigger>
        <SelectContent>
          {available.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="xs" onClick={handleAssign} disabled={!caregiverId} loading={isPending}>
        Assign
      </Button>
    </div>
  );
}

function CaregiverChip({ careRecipientId, caregiver }: { careRecipientId: string; caregiver: { id: string; name: string } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      try {
        await unassignCaregiver(careRecipientId, caregiver.id);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to unassign caregiver");
      }
    });
  }

  return (
    <Badge variant="secondary" className="gap-1 pr-1">
      {caregiver.name}
      <button type="button" onClick={handleRemove} disabled={isPending} className="rounded-full hover:bg-muted-foreground/20">
        <X className="size-3" />
      </button>
    </Badge>
  );
}

function ArchiveRecipientButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    if (!confirm("Archive this care recipient? They'll no longer show up for their assigned caregivers.")) return;
    startTransition(async () => {
      try {
        await archiveCareRecipient(id);
        toast.success("Care recipient archived");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to archive");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleArchive} loading={isPending}>
      Archive
    </Button>
  );
}

// Recipients ("who a Caregiver actually visits") are a different thing from
// the Client itself (the licensing agency) — see prisma/schema.prisma. This
// card is where an agency's own recipients live, mirroring
// McoCredentialsCard/ClientCredentialsCard's shape on this same page.
export function CareRecipientsCard({
  clientId,
  recipients,
  caregivers,
}: {
  clientId: string;
  recipients: CareRecipientRow[];
  caregivers: { id: string; name: string }[];
}) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Care Recipients</h2>
          <NewCareRecipientDialog clientId={clientId} />
        </div>
        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No care recipients added for this client yet.</p>
        ) : (
          <div className="space-y-2">
            {recipients.map((r) => (
              <div key={r.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{r.name}</div>
                  <ArchiveRecipientButton id={r.id} />
                </div>
                <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {r.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="size-3.5" />
                      <a href={mapsLinkForAddress(r.address)} target="_blank" rel="noreferrer" className="hover:underline">
                        {r.address}
                      </a>
                    </div>
                  )}
                  {r.contactInfo && <div>{r.contactInfo}</div>}
                  {r.notes && <div>{r.notes}</div>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {r.assignments.map((a) => (
                    <CaregiverChip key={a.caregiver.id} careRecipientId={r.id} caregiver={a.caregiver} />
                  ))}
                  <AssignCaregiverControl
                    careRecipientId={r.id}
                    caregivers={caregivers}
                    alreadyAssigned={r.assignments.map((a) => a.caregiver.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
