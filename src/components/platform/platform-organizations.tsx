"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOrganizationFromPlatform,
  inviteOwnerFromPlatform,
  openSupportSessionFromPlatform,
  resendOwnerInvitesFromPlatform,
  setOrganizationStatusFromPlatform,
  setWorkspaceSetupFromPlatform,
} from "@/lib/actions/platform";
import type { PlatformOrganization } from "@/lib/platform";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Org = PlatformOrganization & { url: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function useAction() {
  const router = useRouter();
  const [isPending, start] = useTransition();
  function run<T>(action: () => Promise<Result<T>>, onOk: (data: T) => void) {
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        onOk(result.data);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Something went wrong. Please try again."));
      }
    });
  }
  return { isPending, run };
}

// Suggests the address from the name ("Sunrise Home Care" -> "sunrise-home-care") until edited.
function slugify(name: string) {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(date: Date | string | null) {
  return date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

type Kind = "FULL" | "TASKS";
const KIND_LABELS: Record<Kind, string> = { FULL: "Full (licensing CRM)", TASKS: "Tasks only (client company)" };
const NO_MANAGER = "none";

// Type + managing company (docs/workspace-tasks-plan.md). Managers: any
// other workspace that isn't itself managed.
function SetupFields({
  kind,
  managedBy,
  onKind,
  onManagedBy,
  managers,
}: {
  kind: Kind;
  managedBy: string;
  onKind: (k: Kind) => void;
  onManagedBy: (id: string) => void;
  managers: { id: string; name: string }[];
}) {
  const names = new Map(managers.map((m) => [m.id, m.name]));
  return (
    <>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={kind} onValueChange={(v) => onKind(v as Kind)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: Kind) => KIND_LABELS[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FULL">{KIND_LABELS.FULL}</SelectItem>
            <SelectItem value="TASKS">{KIND_LABELS.TASKS}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Managed by</Label>
        <Select value={managedBy} onValueChange={(v) => onManagedBy(String(v))}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: string) => (v === NO_MANAGER ? "Nobody" : names.get(v))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_MANAGER}>Nobody</SelectItem>
            {managers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">The company whose people work here — its admins assign them.</p>
      </div>
    </>
  );
}

function managersFor(organizations: Org[], exceptId?: string) {
  return organizations.filter((o) => o.id !== exceptId && !o.managedByOrgId).map((o) => ({ id: o.id, name: o.name }));
}

function SetupDialog({ org, organizations }: { org: Org; organizations: Org[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>(org.kind);
  const [managedBy, setManagedBy] = useState(org.managedByOrgId ?? NO_MANAGER);
  const { isPending, run } = useAction();

  function save() {
    run(
      () => setWorkspaceSetupFromPlatform(org.id, { kind, managedByOrgId: managedBy === NO_MANAGER ? null : managedBy }),
      () => {
        toast.success(`${org.name} updated`);
        setOpen(false);
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm">Setup</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{org.name} setup</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <SetupFields kind={kind} managedBy={managedBy} onKind={setKind} onManagedBy={setManagedBy} managers={managersFor(organizations, org.id)} />
          <Button className="w-full" onClick={save} loading={isPending}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FORM = { name: "", slug: "", ownerName: "", ownerEmail: "" };

function NewOrganizationDialog({ organizations }: { organizations: Org[] }) {
  const [kind, setKind] = useState<Kind>("TASKS");
  const [managedBy, setManagedBy] = useState(NO_MANAGER);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const { isPending, run } = useAction();

  function set(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [key]: value, ...(key === "name" && !slugEdited ? { slug: slugify(value) } : {}) }));
  }

  function handleCreate() {
    run(() => createOrganizationFromPlatform({ ...form, kind, managedByOrgId: managedBy === NO_MANAGER ? null : managedBy }), ({ slug, inviteSent }) => {
      if (inviteSent) toast.success(`Created ${slug} and invited its owner`);
      else toast.warning(`Created ${slug}, but the owner invite couldn't be sent — use "Resend owner invite".`);
      setOpen(false);
      setForm(EMPTY_FORM);
      setSlugEdited(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New organization</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="org-name">Organization name</Label>
            <Input id="org-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-slug">Address</Label>
            <Input
              id="org-slug"
              value={form.slug}
              onChange={(e) => {
                setSlugEdited(true);
                set("slug", e.target.value.toLowerCase());
              }}
              required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">The workspace&apos;s subdomain. Can&apos;t be changed later.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="owner-name">Owner name</Label>
            <Input id="owner-name" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="owner-email">Owner email</Label>
            <Input id="owner-email" type="email" value={form.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} required />
          </div>
          <SetupFields kind={kind} managedBy={managedBy} onKind={setKind} onManagedBy={setManagedBy} managers={managersFor(organizations)} />
          <Button type="submit" className="w-full" loading={isPending}>
            Create and invite owner
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Adds (or promotes) an owner and emails them a set-password link — for a
// mistyped owner email, or a workspace whose only owner is locked out.
function InviteOwnerDialog({ org }: { org: Org }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const { isPending, run } = useAction();

  function handleInvite() {
    run(() => inviteOwnerFromPlatform(org.id, { name, email }), ({ inviteSent }) => {
      if (inviteSent) toast.success(`Invited ${email} as an owner of ${org.name}`);
      else toast.warning(`${email} is now an owner, but the invite email couldn't be sent — try "Resend owner invite".`);
      setOpen(false);
      setName("");
      setEmail("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" disabled={org.status === "SUSPENDED"}>Invite owner</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite an owner to {org.name}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleInvite();
          }}
        >
          <p className="text-sm text-muted-foreground">
            If this email already has an account in the workspace it becomes an owner (and is reactivated); otherwise a new
            owner account is created. Either way they get a link to set their password.
          </p>
          <div className="space-y-1">
            <Label htmlFor={`invite-name-${org.id}`}>Name</Label>
            <Input id={`invite-name-${org.id}`} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`invite-email-${org.id}`}>Email</Label>
            <Input id={`invite-email-${org.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" loading={isPending}>
            Invite owner
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrganizationRow({ org, organizations }: { org: Org; organizations: Org[] }) {
  const { isPending, run } = useAction();
  const suspended = org.status === "SUSPENDED";

  function toggleStatus() {
    const next = suspended ? "ACTIVE" : "SUSPENDED";
    if (next === "SUSPENDED" && !confirm(`Suspend ${org.name}? Nobody can sign in to ${org.slug} until it's reactivated.`)) return;
    run(
      () => setOrganizationStatusFromPlatform(org.id, next),
      () => toast.success(`${org.name} ${next === "SUSPENDED" ? "suspended" : "reactivated"}`)
    );
  }

  function resendInvite() {
    run(
      () => resendOwnerInvitesFromPlatform(org.id),
      (n) => toast.success(n ? `Re-sent ${n} owner invite${n === 1 ? "" : "s"}` : "Every owner has already accepted their invite")
    );
  }

  function openSupport() {
    // Opened now, inside the click, so the browser doesn't block it as a
    // pop-up; it's pointed at the one-time link once that's issued.
    const tab = window.open("about:blank", "_blank");
    run(
      () => openSupportSessionFromPlatform(org.id),
      (url) => {
        if (tab) tab.location.href = url;
        else window.location.href = url;
      }
    );
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{org.name}</div>
        <a href={org.url} className="font-mono text-xs text-muted-foreground underline" target="_blank" rel="noreferrer">
          {org.slug}
        </a>
        <div className="text-xs text-muted-foreground">
          {org.kind === "TASKS" ? "Tasks only" : "Full"}
          {org.managedByName && ` · managed by ${org.managedByName}`}
        </div>
      </TableCell>
      <TableCell>{suspended ? <Badge variant="outline">Suspended</Badge> : <Badge variant="secondary">Active</Badge>}</TableCell>
      <TableCell className="text-right tabular-nums">{org.userCount}</TableCell>
      <TableCell className="text-right tabular-nums">{org.clientCount}</TableCell>
      <TableCell className="text-right tabular-nums">{org.applicationCount}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytes(org.storageBytes)}</TableCell>
      <TableCell className="text-muted-foreground">{formatDate(org.lastActivityAt)}</TableCell>
      <TableCell className="text-muted-foreground">
        {org.termsVersion ? (
          <span title={`Accepted ${formatDate(org.termsAcceptedAt)}`}>{org.termsVersion}</span>
        ) : (
          "Not yet"
        )}
      </TableCell>
      <TableCell className="space-x-1 whitespace-nowrap text-right">
        <Button variant="ghost" size="sm" disabled={isPending || suspended} onClick={openSupport} title={suspended ? "Reactivate it to open it" : undefined}>
          Open workspace
        </Button>
        <SetupDialog org={org} organizations={organizations} />
        <InviteOwnerDialog org={org} />
        <Button variant="ghost" size="sm" disabled={isPending || suspended} onClick={resendInvite}>
          Resend owner invite
        </Button>
        <Button variant="ghost" size="sm" loading={isPending} onClick={toggleStatus}>
          {suspended ? "Reactivate" : "Suspend"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function PlatformOrganizations({ organizations }: { organizations: Org[] }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewOrganizationDialog organizations={organizations} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workspace</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Users</TableHead>
            <TableHead className="text-right">Clients</TableHead>
            <TableHead className="text-right">Cases</TableHead>
            <TableHead className="text-right">Files</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead>Terms</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((org) => (
            <OrganizationRow key={org.id} org={org} organizations={organizations} />
          ))}
          {organizations.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground">
                No workspaces yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
