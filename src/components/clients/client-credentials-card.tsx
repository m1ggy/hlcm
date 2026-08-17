"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil } from "lucide-react";
import {
  createClientCredential,
  updateClientCredential,
  deleteClientCredential,
} from "@/lib/actions/client-credentials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

export type ClientCredential = {
  id: string;
  label: string;
  username: string | null;
  password: string | null;
  url: string | null;
  notes: string | null;
};

function CredentialFields({ defaultValues }: { defaultValues?: ClientCredential }) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="label">Label</Label>
        <Input id="label" name="label" placeholder="e.g. IDPH Portal" defaultValue={defaultValues?.label} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="url">URL</Label>
        <Input id="url" name="url" placeholder="https://…" defaultValue={defaultValues?.url ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" defaultValue={defaultValues?.username ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" defaultValue={defaultValues?.password ?? ""} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaultValues?.notes ?? ""} />
      </div>
    </>
  );
}

function NewCredentialDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await createClientCredential(clientId, formData);
        toast.success("Credential added");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add credential");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add credential</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add login credential</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <CredentialFields />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Adding..." : "Add"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCredentialDialog({ credential }: { credential: ClientCredential }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateClientCredential(credential.id, formData);
        toast.success("Credential updated");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update credential");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7"><Pencil className="size-3.5" /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit login credential</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <CredentialFields defaultValues={credential} />
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCredentialButton({ credential }: { credential: ClientCredential }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Remove the "${credential.label}" credential?`)) return;
    startTransition(async () => {
      try {
        await deleteClientCredential(credential.id);
        toast.success("Credential removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove credential");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}>
      Remove
    </Button>
  );
}

function PasswordField({ value }: { value: string | null }) {
  const [visible, setVisible] = useState(false);
  if (!value) return <span>—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono">{visible ? value : "•".repeat(Math.min(value.length, 10))}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-5"
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      </Button>
    </span>
  );
}

// Kept as its own card, separate from the Notes tab, so credentials don't
// get buried under a growing comment thread (spec, docs/pipeline-stage-plan.md
// Phase 8) — a VA needs to find a login fast, not scroll through notes.
export function ClientCredentialsCard({
  clientId,
  credentials,
}: {
  clientId: string;
  credentials: ClientCredential[];
}) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Login Credentials</h2>
          <NewCredentialDialog clientId={clientId} />
        </div>
        {credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">No login credentials saved for this client yet.</p>
        ) : (
          <div className="space-y-2">
            {credentials.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {c.label}
                      </a>
                    ) : (
                      c.label
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <EditCredentialDialog credential={c} />
                    <DeleteCredentialButton credential={c} />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>Username: {c.username || "—"}</div>
                  <div>
                    Password: <PasswordField value={c.password} />
                  </div>
                </div>
                {c.notes && <p className="mt-2 text-sm text-muted-foreground">{c.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
