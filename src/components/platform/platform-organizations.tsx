"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createOrganizationFromPlatform,
  inviteOwnerFromPlatform,
  listStaffForPlatform,
  openSupportSessionFromPlatform,
  resendOwnerInvitesFromPlatform,
  setOrganizationStatusFromPlatform,
  setWorkspaceSetupFromPlatform,
} from "@/lib/actions/platform";
import type { OwnerPasswordMode, PlatformOrganization } from "@/lib/platform";
import { PasswordReveal } from "@/components/shared/password-reveal";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

// How a new owner gets in (src/lib/platform.ts OwnerPasswordMode). Making one
// up is the default: many clients won't follow an invite link.
const PASSWORD_LABELS: Record<OwnerPasswordMode, string> = {
  generate: "Make one up — I'll give it to them",
  invite: "Email them an invite to choose their own",
};

function OwnerPasswordField({ id, value, onChange }: { id: string; value: OwnerPasswordMode; onChange: (v: OwnerPasswordMode) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Owner&apos;s password</Label>
      <Select value={value} onValueChange={(v) => onChange(v as OwnerPasswordMode)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(v: OwnerPasswordMode) => PASSWORD_LABELS[v]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="generate">{PASSWORD_LABELS.generate}</SelectItem>
          <SelectItem value="invite">{PASSWORD_LABELS.invite}</SelectItem>
        </SelectContent>
      </Select>
      {value === "generate" && <p className="text-xs text-muted-foreground">You&apos;ll see it once, with the address to sign in at.</p>}
    </div>
  );
}

type GivenPassword = { name: string; email: string; password: string; url: string };

function GivenPasswordStep({ given, onDone }: { given: GivenPassword; onDone: () => void }) {
  return (
    <div className="space-y-3">
      <PasswordReveal name={given.name} signIn={given.email} password={given.password} address={given.url.replace(/^https?:\/\//, "")} />
      <Button className="w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
const KIND_LABELS: Record<Kind, string> = { FULL: "Licensing CRM", TASKS: "Full Operations Management System (client company)" };
const NO_MANAGER = "none";

// Type + managing company (docs/workspace-tasks-plan.md). Managers: any
// other workspace that isn't itself managed.
function SetupFields({
  kind,
  managedBy,
  onKind,
  onManagedBy,
  managers,
  care,
  onCare,
}: {
  kind: Kind;
  managedBy: string;
  onKind: (k: Kind) => void;
  onManagedBy: (id: string) => void;
  managers: { id: string; name: string }[];
  care: boolean;
  onCare: (on: boolean) => void;
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
      {kind === "TASKS" && (
        // docs/client-care-plan.md: a care agency's own clients and caregivers.
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <Checkbox className="mt-0.5" checked={care} onCheckedChange={(c) => onCare(c === true)} />
          <span>
            <span className="font-medium">Clients and caregivers</span>
            <span className="block text-xs text-muted-foreground">
              For a care agency: their clients, caregiver logins, visit schedules and clock-in. Off for other companies.
            </span>
          </span>
        </label>
      )}
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
  const [care, setCare] = useState(org.careEnabled);
  const [monitoring, setMonitoring] = useState(org.activityMonitoringAddon);
  const { isPending, run } = useAction();

  function save() {
    run(
      () =>
        setWorkspaceSetupFromPlatform(org.id, {
          kind,
          managedByOrgId: managedBy === NO_MANAGER ? null : managedBy,
          careEnabled: care,
          activityMonitoringAddon: monitoring,
        }),
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
          <SetupFields
            kind={kind}
            managedBy={managedBy}
            onKind={setKind}
            onManagedBy={setManagedBy}
            managers={managersFor(organizations, org.id)}
            care={care}
            onCare={setCare}
          />
          {/* docs/activity-monitoring-plan.md: a paid add-on; the workspace owner then switches it on. */}
          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
            <Checkbox className="mt-0.5" checked={monitoring} onCheckedChange={(c) => setMonitoring(c === true)} />
            <span>
              <span className="font-medium">Activity monitoring add-on</span>
              <span className="block text-xs text-muted-foreground">
                The desktop app: screenshots and apps used while staff are clocked in. The workspace owner still switches it on
                {org.activityMonitoringEnabled ? " (it's on now)" : ""}.
              </span>
            </span>
          </label>
          <Button className="w-full" onClick={save} loading={isPending}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FORM = { name: "", slug: "", ownerName: "", ownerEmail: "" };

type Pick = "STAFF" | "MANAGER" | "ACCOUNT_MANAGER";
const NOT_ASSIGNED = "none";
type PickOption = Pick | typeof NOT_ASSIGNED;
const PICK_LABELS: Record<PickOption, string> = {
  none: "Not assigned",
  STAFF: "Staff",
  MANAGER: "Manager",
  ACCOUNT_MANAGER: "Account manager",
};
type Staff = { id: string; name: string; email: string | null; role: string };

// Creating a workspace (docs/workspace-tasks-plan.md, Phase 4): details,
// type and managing company, then — for a managed workspace — which of the
// managing company's people work there from day one.
function NewOrganizationDialog({ organizations }: { organizations: Org[] }) {
  const [kind, setKind] = useState<Kind>("TASKS");
  const [care, setCare] = useState(false);
  const [passwordMode, setPasswordMode] = useState<OwnerPasswordMode>("generate");
  const [given, setGiven] = useState<GivenPassword | null>(null);
  const [managedBy, setManagedBy] = useState(NO_MANAGER);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"details" | "staff">("details");
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const [staff, setStaff] = useState<{ orgId: string; people: Staff[] } | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [loadingStaff, startLoadingStaff] = useTransition();
  const { isPending, run } = useAction();
  const managed = managedBy !== NO_MANAGER;
  const managerName = organizations.find((o) => o.id === managedBy)?.name ?? "the managing company";

  function set(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((f) => ({ ...f, [key]: value, ...(key === "name" && !slugEdited ? { slug: slugify(value) } : {}) }));
  }

  function reset() {
    setStep("details");
    setForm(EMPTY_FORM);
    setSlugEdited(false);
    setPicks({});
    setGiven(null);
    setPasswordMode("generate");
  }

  function chooseManager(id: string) {
    setManagedBy(id);
    setPicks({});
  }

  function pick(userId: string, value: PickOption) {
    setPicks((current) => {
      const next = { ...current };
      if (value === NOT_ASSIGNED) delete next[userId];
      else next[userId] = value;
      return next;
    });
  }

  function goToStaff() {
    setStep("staff");
    if (staff?.orgId === managedBy) return;
    startLoadingStaff(async () => {
      const result = await listStaffForPlatform(managedBy);
      if (!result.ok) {
        toast.error(result.error);
        setStep("details");
        return;
      }
      setStaff({ orgId: managedBy, people: result.data });
    });
  }

  function handleCreate() {
    const assign = managed
      ? Object.entries(picks).map(([homeUserId, p]) => ({
          homeUserId,
          role: p === "STAFF" ? ("STAFF" as const) : ("MANAGER" as const),
          canAssign: p === "ACCOUNT_MANAGER",
        }))
      : [];
    run(
      () =>
        createOrganizationFromPlatform({
          ...form,
          kind,
          careEnabled: kind === "TASKS" && care,
          managedByOrgId: managed ? managedBy : null,
          assign,
          ownerPassword: passwordMode,
        }),
      ({ slug, url, inviteSent, ownerPassword, assigned, assignErrors }) => {
        const people = assigned ? `, assigned ${assigned} ${assigned === 1 ? "person" : "people"}` : "";
        for (const error of assignErrors) toast.error(error);
        if (ownerPassword) {
          toast.success(`Created ${slug}${people}`);
          setGiven({ name: form.ownerName.trim(), email: form.ownerEmail.trim().toLowerCase(), password: ownerPassword, url });
          return;
        }
        if (inviteSent) toast.success(`Created ${slug}${people} and invited its owner`);
        else toast.warning(`Created ${slug}${people}, but the owner invite couldn't be sent — use "Resend owner invite".`);
        setOpen(false);
        reset();
      }
    );
  }

  const people = staff?.orgId === managedBy ? staff.people : [];
  const pickedCount = Object.keys(picks).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Once the password has been shown, closing starts over: it isn't shown again.
        if (!o && given) reset();
        else if (!o) setStep("details");
      }}
    >
      <DialogTrigger render={<Button>New organization</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{given ? `${form.name || "Workspace"} is ready` : step === "details" ? "New organization" : `Who from ${managerName} works here?`}</DialogTitle>
          {managed && !given && <p className="text-xs text-muted-foreground">Step {step === "details" ? 1 : 2} of 2</p>}
        </DialogHeader>
        {given ? (
          <GivenPasswordStep
            given={given}
            onDone={() => {
              setOpen(false);
              reset();
            }}
          />
        ) : step === "details" ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (managed) goToStaff();
              else handleCreate();
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
              <p className="text-xs text-muted-foreground">How they sign in.</p>
            </div>
            <OwnerPasswordField id="owner-password" value={passwordMode} onChange={setPasswordMode} />
            <SetupFields
              kind={kind}
              managedBy={managedBy}
              onKind={setKind}
              onManagedBy={chooseManager}
              managers={managersFor(organizations)}
              care={care}
              onCare={setCare}
            />
            {kind === "TASKS" && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Starts with a &ldquo;Getting started&rdquo; project for the client instead of the licensing setup.
              </p>
            )}
            <Button type="submit" className="w-full" loading={isPending}>
              {managed ? "Next: assign staff" : passwordMode === "generate" ? "Create and make a password" : "Create and invite owner"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Each person gets a linked account in {form.name || "the new workspace"} and opens it with the workspace switcher.
              Managers run projects; an account manager can also assign staff later. This can change any time on {managerName}
              &apos;s Client workspaces page.
            </p>
            {loadingStaff ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading people…</p>
            ) : people.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{managerName} has nobody to assign yet.</p>
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
                {people.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                    </div>
                    <Select value={picks[p.id] ?? NOT_ASSIGNED} onValueChange={(v) => pick(p.id, v as PickOption)}>
                      <SelectTrigger className="w-40" aria-label={`Role for ${p.name}`}>
                        <SelectValue>{(v: PickOption) => PICK_LABELS[v]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PICK_LABELS) as PickOption[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {PICK_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("details")} disabled={isPending}>
                Back
              </Button>
              <Button className="flex-1" onClick={handleCreate} loading={isPending} disabled={loadingStaff}>
                {passwordMode === "generate"
                  ? pickedCount
                    ? `Create, assign ${pickedCount}, make a password`
                    : "Create and make a password"
                  : pickedCount
                    ? `Create, assign ${pickedCount}, invite owner`
                    : "Create and invite owner"}
              </Button>
            </div>
          </div>
        )}
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
  const [promoteExisting, setPromoteExisting] = useState(false);
  const [passwordMode, setPasswordMode] = useState<OwnerPasswordMode>("generate");
  const [given, setGiven] = useState<GivenPassword | null>(null);
  const { isPending, run } = useAction();

  function clear() {
    setName("");
    setEmail("");
    setPromoteExisting(false);
    setPasswordMode("generate");
    setGiven(null);
  }

  function handleInvite() {
    run(() => inviteOwnerFromPlatform(org.id, { name, email, promoteExisting, password: passwordMode }), ({ inviteSent, ownerPassword, url }) => {
      if (ownerPassword) {
        toast.success(`${email} is now an owner of ${org.name}`);
        setGiven({ name: name.trim(), email: email.trim().toLowerCase(), password: ownerPassword, url });
        return;
      }
      if (inviteSent) toast.success(`Invited ${email} as an owner of ${org.name}`);
      else toast.warning(`${email} is now an owner, but the invite email couldn't be sent — try "Resend owner invite".`);
      setOpen(false);
      clear();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && given) clear();
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" disabled={org.status === "SUSPENDED"}>Add owner</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{given ? "Owner added" : `Add an owner to ${org.name}`}</DialogTitle>
        </DialogHeader>
        {given ? (
          <GivenPasswordStep
            given={given}
            onDone={() => {
              setOpen(false);
              clear();
            }}
          />
        ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleInvite();
          }}
        >
          <p className="text-sm text-muted-foreground">
            A new owner account is created — with a password you give them, or an emailed link to set their own. Staff assigned
            from the managing company can&apos;t be made owners.
          </p>
          <div className="space-y-1">
            <Label htmlFor={`invite-name-${org.id}`}>Name</Label>
            <Input id={`invite-name-${org.id}`} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`invite-email-${org.id}`}>Email</Label>
            <Input id={`invite-email-${org.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={promoteExisting} onCheckedChange={(c) => setPromoteExisting(c === true)} className="mt-0.5" />
            <span>
              Make an existing account an owner
              <span className="block text-xs text-muted-foreground">
                If this email already has an account in {org.name}, promote it to owner (and reactivate it).
                {passwordMode === "generate" && " Their password is replaced by the new one."}
              </span>
            </span>
          </label>
          <OwnerPasswordField id={`invite-password-${org.id}`} value={passwordMode} onChange={setPasswordMode} />
          <Button type="submit" className="w-full" loading={isPending}>
            {passwordMode === "generate" ? "Add owner and make a password" : "Invite owner"}
          </Button>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The console's actions on one workspace — its row in the list and its details page. */
export function WorkspaceActions({ org, organizations }: { org: Org; organizations: Org[] }) {
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
    <>
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
    </>
  );
}

function OrganizationRow({ org, organizations }: { org: Org; organizations: Org[] }) {
  const suspended = org.status === "SUSPENDED";
  return (
    <TableRow>
      <TableCell>
        <Link href={`/platform/workspaces/${org.id}`} className="font-medium hover:underline">
          {org.name}
        </Link>
        <a href={org.url} className="font-mono text-xs text-muted-foreground underline" target="_blank" rel="noreferrer">
          {org.slug}
        </a>
        <div className="text-xs text-muted-foreground">
          {org.kind === "TASKS" ? (org.careEnabled ? "Full Operations Management System + care" : "Full Operations Management System") : "Licensing CRM"}
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
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/platform/workspaces/${org.id}`} />}>
          Details
        </Button>
        <WorkspaceActions org={org} organizations={organizations} />
      </TableCell>
    </TableRow>
  );
}

export type { Org as PlatformOrg };

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
