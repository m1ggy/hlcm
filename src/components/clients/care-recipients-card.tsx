"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, X } from "lucide-react";
import {
  listCareRecipients,
  createCareRecipient,
  updateCareRecipient,
  archiveCareRecipient,
  restoreCareRecipient,
  assignCaregiver,
  unassignCaregiver,
} from "@/lib/actions/care-recipients";
import { CareInstructionChecklist, type CareInstructionRow } from "@/components/clients/care-instruction-checklist";
import { RecipientSummary, ageFromDob } from "@/components/clients/care-recipient-summary";
import { AvatarInitials } from "@/components/ui/avatar-initials";
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
  dateOfBirth: Date | null;
  phone: string | null;
  email: string | null;
  preferredContactMethod: string | null;
  contactNotes: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  careNotes: string | null;
  visitSchedule: string | null;
  latitude: number | null;
  longitude: number | null;
  assignments: { caregiver: { id: string; name: string } }[];
  instructions: CareInstructionRow[];
};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}


// Shared by both Add and Edit — prefixed ids since this mounts on the same
// Client detail page as ClientDetailsForm, which already owns plain #name/
// #address/#contactInfo ids on its own always-visible, save-on-blur inputs.
// An id collision here isn't just invalid HTML, it risks a label click or
// fill targeting the Client's own live-saving field instead of this form's
// (caught live during verification — see the geo-location-login plan).
const CONTACT_METHOD_NONE = "__none__";
const CONTACT_METHODS = ["Phone", "Email", "Text"];

function CareRecipientFields({ defaultValues }: { defaultValues?: CareRecipientRow }) {
  const [preferredContactMethod, setPreferredContactMethod] = useState(defaultValues?.preferredContactMethod || CONTACT_METHOD_NONE);

  return (
    <>
      <p className="text-xs text-muted-foreground">
        The person a Caregiver actually visits and gives hands-on care to — not a contact at the agency itself.
      </p>
      <div className="space-y-1">
        <Label htmlFor="care-recipient-name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input id="care-recipient-name" name="name" defaultValue={defaultValues?.name} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="care-recipient-address">Address</Label>
          <Input
            id="care-recipient-address"
            name="address"
            placeholder="Where a caregiver visits them"
            defaultValue={defaultValues?.address ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="care-recipient-dob">Date of birth</Label>
          <Input
            id="care-recipient-dob"
            name="dateOfBirth"
            type="date"
            defaultValue={toDateInputValue(defaultValues?.dateOfBirth ?? null)}
          />
        </div>
      </div>

      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">How to reach them directly</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="care-recipient-phone">Phone</Label>
            <Input
              id="care-recipient-phone"
              name="phone"
              type="tel"
              placeholder="Their own number, if they have one"
              defaultValue={defaultValues?.phone ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="care-recipient-email">Email</Label>
            <Input
              id="care-recipient-email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="care-recipient-preferred">Preferred contact method</Label>
          <Select
            items={{ [CONTACT_METHOD_NONE]: "No preference", ...Object.fromEntries(CONTACT_METHODS.map((m) => [m, m])) }}
            value={preferredContactMethod}
            onValueChange={(v) => setPreferredContactMethod(v ?? CONTACT_METHOD_NONE)}
          >
            <SelectTrigger id="care-recipient-preferred" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CONTACT_METHOD_NONE}>No preference</SelectItem>
              {CONTACT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="preferredContactMethod" value={preferredContactMethod === CONTACT_METHOD_NONE ? "" : preferredContactMethod} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="care-recipient-contact-notes">Other notes</Label>
          <Input
            id="care-recipient-contact-notes"
            name="contactNotes"
            placeholder="Best times to call, hard of hearing, reachable via a neighbor, ..."
            defaultValue={defaultValues?.contactNotes ?? ""}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Who to call in an emergency</legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="care-recipient-ec-name">Name</Label>
            <Input
              id="care-recipient-ec-name"
              name="emergencyContactName"
              defaultValue={defaultValues?.emergencyContactName ?? ""}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="care-recipient-ec-relationship">Relationship</Label>
            <Input
              id="care-recipient-ec-relationship"
              name="emergencyContactRelationship"
              placeholder="Daughter, spouse, ..."
              defaultValue={defaultValues?.emergencyContactRelationship ?? ""}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="care-recipient-ec-phone">Phone</Label>
          <Input
            id="care-recipient-ec-phone"
            name="emergencyContactPhone"
            type="tel"
            defaultValue={defaultValues?.emergencyContactPhone ?? ""}
          />
        </div>
      </fieldset>

      <div className="space-y-1">
        <Label htmlFor="care-recipient-careNotes">Care needs & medical notes</Label>
        <Textarea
          id="care-recipient-careNotes"
          name="careNotes"
          rows={3}
          placeholder="Conditions, allergies, mobility needs — what a caregiver should know before a visit"
          defaultValue={defaultValues?.careNotes ?? ""}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="care-recipient-schedule">Visit schedule</Label>
        <Input
          id="care-recipient-schedule"
          name="visitSchedule"
          placeholder="e.g. Mon/Wed/Fri mornings"
          defaultValue={defaultValues?.visitSchedule ?? ""}
        />
      </div>
    </>
  );
}

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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a care recipient</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <CareRecipientFields />
          <Button type="submit" className="w-full" loading={isPending}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCareRecipientDialog({ recipient }: { recipient: CareRecipientRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateCareRecipient(recipient.id, formData);
        toast.success("Care recipient updated");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update care recipient");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7"><Pencil className="size-3.5" /></Button>} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit care recipient</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <CareRecipientFields defaultValues={recipient} />
          <Button type="submit" className="w-full" loading={isPending}>
            Save
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

function RestoreRecipientButton({ id, onRestored }: { id: string; onRestored: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      try {
        await restoreCareRecipient(id);
        toast.success("Care recipient restored");
        router.refresh();
        onRestored();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to restore");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleRestore} loading={isPending}>
      Restore
    </Button>
  );
}

// Archived recipients aren't fetched up front with the active list — a
// separate, on-demand section (client-side call to listCareRecipients with
// filter: "archived") kept out of the way until someone actually needs to
// find and restore one, same "hidden until asked for" shape the Clients
// list page uses for its own archived view.
function ArchivedRecipients({ clientId }: { clientId: string }) {
  const [archived, setArchived] = useState<CareRecipientRow[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      try {
        const rows = await listCareRecipients({ clientId, filter: "archived" });
        setArchived(rows);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load archived recipients");
      }
    });
  }

  if (archived === null) {
    return (
      <Button variant="link" size="sm" className="px-0" onClick={load} loading={isPending}>
        Show archived
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Archived</p>
        <Button variant="link" size="sm" className="px-0" onClick={() => setArchived(null)}>
          Hide
        </Button>
      </div>
      {archived.length === 0 ? (
        <p className="text-sm text-muted-foreground">No archived care recipients for this client.</p>
      ) : (
        archived.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-dashed p-3">
            <span className="text-sm text-muted-foreground">{r.name}</span>
            <RestoreRecipientButton id={r.id} onRestored={load} />
          </div>
        ))
      )}
    </div>
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
          <div className="space-y-3">
            {recipients.map((r) => {
              const recipientAge = ageFromDob(r.dateOfBirth);
              return (
                <div key={r.id} className="rounded-xl border p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <AvatarInitials name={r.name} className="size-8 text-sm" />
                      <div>
                        <div className="font-medium leading-tight">{r.name}</div>
                        {recipientAge !== null && <div className="text-xs text-muted-foreground">Age {recipientAge}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <EditCareRecipientDialog recipient={r} />
                      <ArchiveRecipientButton id={r.id} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <RecipientSummary recipient={r} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {r.assignments.map((a) => (
                      <CaregiverChip key={a.caregiver.id} careRecipientId={r.id} caregiver={a.caregiver} />
                    ))}
                    <AssignCaregiverControl
                      careRecipientId={r.id}
                      caregivers={caregivers}
                      alreadyAssigned={r.assignments.map((a) => a.caregiver.id)}
                    />
                  </div>
                  <div className="mt-3 border-t pt-3">
                    <CareInstructionChecklist careRecipientId={r.id} instructions={r.instructions} canManage />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 border-t pt-3">
          <ArchivedRecipients clientId={clientId} />
        </div>
      </CardContent>
    </Card>
  );
}
