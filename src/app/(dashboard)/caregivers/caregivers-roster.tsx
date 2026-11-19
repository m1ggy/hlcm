"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, History, Mail, Pencil, Phone, Search, UserRound, Users, X } from "lucide-react";
import { createCaregiver, updateCaregiver, type CaregiverRosterRow } from "@/lib/actions/caregivers";
import { assignCaregiver, unassignCaregiver } from "@/lib/actions/care-recipients";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { formatDuration } from "@/lib/time-entries";
import { cn } from "@/lib/utils";
import { WEEKDAY_DISPLAY_ORDER, WEEKDAY_SHORT, formatShiftRange } from "@/lib/visits";
import { PasswordReveal } from "@/components/shared/password-reveal";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function AddCaregiverDialog() {
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
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil className="size-3.5" /> Edit
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

type Filter = "active" | "onShift" | "inactive";

const shortDate = (d: Date) => new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeOf = (d: Date) => new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const scheduledHours = (c: CaregiverRosterRow) => c.shifts.reduce((sum, s) => sum + (s.endMinute - s.startMinute) / 60, 0);

/**
 * The caregivers list beside the chosen caregiver's page: who they are, how
 * they sign in, their week, their clients and their last visits. The chosen
 * one is in the address (?open=).
 */
export function CaregiversRoster({
  roster,
  tasksWorkspace,
  clients,
  openId,
}: {
  roster: CaregiverRosterRow[];
  tasksWorkspace: boolean;
  /** Active clients, to assign from here (a care agency's workspace only). */
  clients: { id: string; name: string }[];
  openId?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(openId && roster.some((c) => c.id === openId) ? openId : null);

  // Keep ?open= in the address so a refresh or a shared link shows the same caregiver.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("open", selectedId);
    else url.searchParams.delete("open");
    window.history.replaceState(window.history.state, "", url);
  }, [selectedId]);

  const counts = useMemo(
    () => ({ active: roster.filter((c) => c.active).length, onShift: roster.filter((c) => c.onShift).length, inactive: roster.filter((c) => !c.active).length }),
    [roster]
  );
  const q = query.trim().toLowerCase();
  const shown = roster.filter((c) => {
    if (filter === "active" && !c.active) return false;
    if (filter === "onShift" && !c.onShift) return false;
    if (filter === "inactive" && c.active) return false;
    return !q || c.name.toLowerCase().includes(q) || c.clients.some((cl) => cl.name.toLowerCase().includes(q)) || (c.phone ?? "").includes(q);
  });
  // Wide screens always show someone; phones show the list until a caregiver is picked.
  const selected = roster.find((c) => c.id === selectedId) ?? null;
  const shownOnWide = selected ?? shown[0] ?? null;

  if (roster.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
        <Users className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-heading text-lg font-semibold">No caregivers yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add a caregiver and you&apos;ll get a password to pass on. They sign in with their email, or their phone number.
        </p>
      </div>
    );
  }

  const filters = [
    ["active", "Active"],
    ["onShift", "On the clock"],
    ["inactive", "Inactive"],
  ] as const;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className={cn("space-y-3 lg:sticky lg:top-4", selected && "hidden lg:block")}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search caregivers or clients" className="pl-8" aria-label="Search caregivers or clients" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {filters.map(([value, label]) =>
            value === "inactive" && counts.inactive === 0 ? null : (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  filter === value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {label} <span className="tabular-nums opacity-80">{counts[value]}</span>
              </button>
            )
          )}
        </div>
        <ul className="max-h-[calc(100vh-14rem)] divide-y overflow-y-auto rounded-xl border bg-card">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nobody here.</li>}
          {shown.map((c) => {
            const active = shownOnWide?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    active && "lg:bg-primary/8 lg:shadow-[inset_3px_0_0_var(--primary)]",
                    !c.active && "opacity-60"
                  )}
                >
                  <span className="relative shrink-0">
                    <AvatarInitials name={c.name} className="size-9 text-xs" />
                    {c.onShift && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card bg-emerald-500" aria-label="On the clock" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.clients.length ? `${c.clients.length} client${c.clients.length === 1 ? "" : "s"}` : "No clients"} · {formatDuration(c.hoursThisWeek)} this week
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">Hours count from Monday this week.</p>
      </aside>

      {shownOnWide && (
        <section className={cn("min-w-0", !selected && "hidden lg:block")} aria-label={shownOnWide.name}>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 lg:hidden" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="size-4" /> All caregivers
          </Button>
          <CaregiverDetail key={shownOnWide.id} c={shownOnWide} tasksWorkspace={tasksWorkspace} clients={clients} />
        </section>
      )}
    </div>
  );
}

function CaregiverDetail({ c, tasksWorkspace, clients }: { c: CaregiverRosterRow; tasksWorkspace: boolean; clients: { id: string; name: string }[] }) {
  const clientLink = (client: { id: string; name: string }) =>
    tasksWorkspace ? (
      <Link href={`/care-recipients?open=${client.id}`} className="hover:underline">
        {client.name}
      </Link>
    ) : (
      client.name
    );
  const perDay = WEEKDAY_DISPLAY_ORDER.map((weekday) => ({ weekday, shifts: c.shifts.filter((s) => s.weekday === weekday) }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AvatarInitials name={c.name} className="size-14 shrink-0 text-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-xl font-semibold tracking-tight">{c.name}</h2>
              {c.onShift && (
                <Badge variant="secondary" className="gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> On the clock
                </Badge>
              )}
              {!c.active && <Badge variant="outline">Inactive</Badge>}
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline">
                  <Phone className="size-3.5" /> {c.phone}
                </a>
              )}
              {c.email ? (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline">
                  <Mail className="size-3.5" /> {c.email}
                </a>
              ) : (
                <span>Signs in with their phone</span>
              )}
              <span>{lastSeen(c.lastSignInAt)}</span>
            </p>
          </div>
          <EditCaregiverDialog caregiver={c} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Hours this week">{formatDuration(c.hoursThisWeek)}</Stat>
          <Stat label="Visits this week">{c.visitsThisWeek}</Stat>
          <Stat label="Clients">{c.clients.length}</Stat>
          <Stat label="Scheduled weekly">{c.shifts.length ? formatDuration(scheduledHours(c)) : <span className="text-muted-foreground">None</span>}</Stat>
        </dl>
      </div>

      <Panel title="Weekly visits" icon={<CalendarDays className="size-4" />}>
        {c.shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No regular visits yet. Set visit times on a client&apos;s Schedule.</p>
        ) : (
          <ol className="divide-y">
            {perDay
              .filter((d) => d.shifts.length > 0)
              .map(({ weekday, shifts }) => (
                <li key={weekday} className="flex gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-10 shrink-0 pt-1 text-xs font-semibold text-muted-foreground">{WEEKDAY_SHORT[weekday]}</span>
                  <ul className="flex flex-1 flex-wrap gap-1.5">
                    {shifts.map((s) => (
                      <li key={s.id} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
                        <span className="font-medium">{clientLink(s.client)}</span>
                        <span className="ml-1.5 text-muted-foreground">{formatShiftRange(s.startMinute, s.endMinute)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ol>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel title="Clients" icon={<UserRound className="size-4" />}>
          <div className="space-y-2">
            {c.clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not assigned to anyone yet.</p>
            ) : (
              <ul className="space-y-1">
                {c.clients.map((client) => (
                  <li key={client.id} className="flex items-center gap-2 text-sm">
                    <AvatarInitials name={client.name} className="size-6 text-[10px]" />
                    <span className="min-w-0 flex-1 truncate">{clientLink(client)}</span>
                    {tasksWorkspace && <UnassignButton careRecipientId={client.id} caregiver={c} clientName={client.name} />}
                  </li>
                ))}
              </ul>
            )}
            {tasksWorkspace && c.active && <AssignClientControl caregiverId={c.id} clients={clients.filter((cl) => !c.clients.some((x) => x.id === cl.id))} />}
          </div>
        </Panel>

        <Panel title="Recent visits" icon={<History className="size-4" />}>
          {c.recentVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits in the last month.</p>
          ) : (
            <ul className="divide-y">
              {c.recentVisits.map((v) => (
                <li key={v.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{clientLink(v.client)}</span>
                    <span className="text-xs text-muted-foreground">
                      {shortDate(v.clockIn)} · {timeOf(v.clockIn)} – {v.clockOut ? timeOf(v.clockOut) : "now"}
                    </span>
                  </p>
                  {v.visitNote && <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">&ldquo;{v.visitNote}&rdquo;</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function AssignClientControl({ caregiverId, clients }: { caregiverId: string; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [isPending, start] = useTransition();
  if (clients.length === 0) return null;

  function assign() {
    start(async () => {
      try {
        await assignCaregiver(clientId, caregiverId);
        setClientId("");
        toast.success("Assigned");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't assign"));
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5 pt-1">
      <Select items={Object.fromEntries(clients.map((c) => [c.id, c.name]))} value={clientId || null} onValueChange={(v) => setClientId(v ?? "")}>
        <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
          <SelectValue placeholder="Assign to a client…" />
        </SelectTrigger>
        <SelectContent>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!clientId} loading={isPending} onClick={assign}>
        Assign
      </Button>
    </div>
  );
}

function UnassignButton({ careRecipientId, caregiver, clientName }: { careRecipientId: string; caregiver: { id: string; name: string }; clientName: string }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  function unassign() {
    if (!window.confirm(`Take ${caregiver.name} off ${clientName}? Their weekly visits there are removed too.`)) return;
    start(async () => {
      try {
        await unassignCaregiver(careRecipientId, caregiver.id);
        toast.success(`${caregiver.name} unassigned`);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't unassign"));
      }
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" aria-label={`Unassign from ${clientName}`} title={`Unassign from ${clientName}`} disabled={isPending} onClick={unassign}>
      <X className="size-3.5" />
    </Button>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
