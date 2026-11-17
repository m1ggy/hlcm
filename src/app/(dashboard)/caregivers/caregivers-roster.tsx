"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Phone, Mail } from "lucide-react";
import { createCaregiver, updateCaregiver, type CaregiverRosterRow } from "@/lib/actions/caregivers";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { formatDuration } from "@/lib/time-entries";
import { PasswordReveal } from "@/components/shared/password-reveal";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function lastSeen(date: Date | null) {
  if (!date) return "Never signed in";
  return `Signed in ${new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function SignInFields({ email, phone, onEmail, onPhone }: { email: string; phone: string; onEmail: (v: string) => void; onPhone: (v: string) => void }) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="caregiver-phone">Mobile phone</Label>
        <Input id="caregiver-phone" type="tel" value={phone} onChange={(e) => onPhone(e.target.value)} placeholder="(555) 123-4567" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="caregiver-email">
          Email <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="caregiver-email" type="email" value={email} onChange={(e) => onEmail(e.target.value)} />
        <p className="text-xs text-muted-foreground">They sign in with their email — or, without one, with their phone number.</p>
      </div>
    </>
  );
}

function AddCaregiverDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [created, setCreated] = useState<{ name: string; signIn: string | null; password: string } | null>(null);
  const [isPending, start] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setCreated(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const result = await createCaregiver({ name, email, phone });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setCreated(result.data);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't add the caregiver"));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button>Add caregiver</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{created ? "Caregiver added" : "Add a caregiver"}</DialogTitle>
        </DialogHeader>
        {created ? (
          <div className="space-y-3">
            <PasswordReveal name={created.name} signIn={created.signIn} password={created.password} />
            <Button className="w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="caregiver-name">Name</Label>
              <Input id="caregiver-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <SignInFields email={email} phone={phone} onEmail={setEmail} onPhone={setPhone} />
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              We&apos;ll make up a password and show it once, for you to give them.
            </p>
            <Button type="submit" className="w-full" loading={isPending}>
              Add and make a password
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditCaregiverDialog({ caregiver }: { caregiver: CaregiverRosterRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(caregiver.name);
  const [email, setEmail] = useState(caregiver.email ?? "");
  const [phone, setPhone] = useState(caregiver.phone ?? "");
  const [active, setActive] = useState(caregiver.active);
  const [isPending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const result = await updateCaregiver({ id: caregiver.id, name, email, phone, active });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Caregiver updated");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" title={`Edit ${caregiver.name}`} />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {caregiver.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="caregiver-edit-name">Name</Label>
            <Input id="caregiver-edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <SignInFields email={email} phone={phone} onEmail={setEmail} onPhone={setPhone} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} />
            Active — turning this off stops them signing in
          </label>
          <Button type="submit" className="w-full" loading={isPending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CaregiversRoster({ roster, tasksWorkspace }: { roster: CaregiverRosterRow[]; tasksWorkspace: boolean }) {
  const [showInactive, setShowInactive] = useState(false);
  const active = roster.filter((c) => c.active);
  const inactive = roster.filter((c) => !c.active);
  const shown = showInactive ? roster : active;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {active.length} active caregiver{active.length === 1 ? "" : "s"} · hours are this week, Monday on
          </p>
          <AddCaregiverDialog />
        </div>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No caregivers yet — add the first one.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {shown.map((c) => (
              <li key={c.id} className={`flex flex-wrap items-start gap-3 px-3 py-3 ${c.active ? "" : "opacity-60"}`}>
                <AvatarInitials name={c.name} className="size-9 shrink-0 text-sm" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {!c.active && <Badge variant="outline">Inactive</Badge>}
                    {c.onShift && <Badge variant="secondary">On the clock</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" /> {c.phone}
                      </span>
                    )}
                    {c.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" /> {c.email}
                      </span>
                    ) : (
                      <span>Signs in with phone</span>
                    )}
                    <span>{lastSeen(c.lastSignInAt)}</span>
                  </div>
                  <p className="text-xs">
                    {c.clients.length ? (
                      c.clients.map((client, i) => (
                        <span key={client.id}>
                          {i > 0 && ", "}
                          {tasksWorkspace ? (
                            <Link href={`/care-recipients?open=${client.id}`} className="hover:underline">
                              {client.name}
                            </Link>
                          ) : (
                            client.name
                          )}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No clients assigned</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <div className="text-sm font-medium tabular-nums">{formatDuration(c.hoursThisWeek)}</div>
                    <div className="text-muted-foreground">
                      {c.visitsThisWeek} visit{c.visitsThisWeek === 1 ? "" : "s"}
                    </div>
                  </div>
                  <EditCaregiverDialog caregiver={c} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {inactive.length > 0 && (
          <Button variant="link" size="sm" className="px-0" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? "Hide inactive" : `Show ${inactive.length} inactive`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
