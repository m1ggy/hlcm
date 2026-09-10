"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { createClientContact, updateClientContact, deleteClientContact } from "@/lib/actions/client-contacts";
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

export type ClientContact = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
};

// Ids namespaced with "client-contact-" — this card's dialog shares a page
// with ClientDetailsForm's own #name field (and others), and duplicate ids
// are both invalid HTML and, worse, a real footgun: a script or extension
// driving the page by id can land on the wrong field entirely. Same
// namespacing convention care-recipients-card.tsx already uses.
function ContactFields({ defaultValues }: { defaultValues?: ClientContact }) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="client-contact-name">Name</Label>
        <Input id="client-contact-name" name="name" defaultValue={defaultValues?.name} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="client-contact-role">Role</Label>
        <Input id="client-contact-role" name="role" placeholder="e.g. Office manager" defaultValue={defaultValues?.role ?? ""} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="client-contact-email">Email</Label>
          <Input id="client-contact-email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-contact-phone">Phone</Label>
          <Input id="client-contact-phone" name="phone" type="tel" defaultValue={defaultValues?.phone ?? ""} />
        </div>
      </div>
    </>
  );
}

function NewContactDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("clientId", clientId);
    startTransition(async () => {
      try {
        await createClientContact(formData);
        toast.success("Contact added");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add contact");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add contact</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <ContactFields />
          <Button type="submit" className="w-full" loading={isPending}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditContactDialog({ contact }: { contact: ClientContact }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateClientContact(contact.id, formData);
        toast.success("Contact updated");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update contact");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7"><Pencil className="size-3.5" /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <ContactFields defaultValues={contact} />
          <Button type="submit" className="w-full" loading={isPending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteContactButton({ contact }: { contact: ClientContact }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Remove "${contact.name}" as a contact?`)) return;
    startTransition(async () => {
      try {
        await deleteClientContact(contact.id);
        toast.success("Contact removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove contact");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} loading={isPending}>
      Remove
    </Button>
  );
}

// A client's "Other contact info" stays a single freeform line for whatever
// doesn't fit here — this card is for the people worth reaching by name: a
// partner, an office manager, whoever else is actually part of the
// conversation beyond the primary business contact.
export function ClientContactsCard({ clientId, contacts }: { clientId: string; contacts: ClientContact[] }) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Contacts</h2>
          <NewContactDialog clientId={clientId} />
        </div>
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional contacts on file yet.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.role && <span className="ml-1.5 text-sm text-muted-foreground">— {c.role}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <EditContactDialog contact={c} />
                    <DeleteContactButton contact={c} />
                  </div>
                </div>
                {(c.email || c.phone) && (
                  <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                    {c.email && (
                      <div>
                        <a href={`mailto:${c.email}`} className="hover:underline">
                          {c.email}
                        </a>
                      </div>
                    )}
                    {c.phone && (
                      <div>
                        <a href={`tel:${c.phone}`} className="hover:underline">
                          {c.phone}
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
