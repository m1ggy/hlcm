"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, ClipboardCheck, History, MapPin, Phone, Search, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT, formatMinuteOfDay, formatShiftRange } from "@/lib/visits";
import type { CareVisitAlerts } from "@/components/visits/care-visits-today-card";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CareInstructionChecklist } from "@/components/clients/care-instruction-checklist";
import { VisitScheduleEditor, RecentVisits, CareIncidents } from "@/components/clients/care-recipient-visits";
import { RecipientSummary, ageFromDob } from "@/components/clients/care-recipient-summary";
import {
  ArchiveRecipientButton,
  ArchivedRecipients,
  AssignCaregiverControl,
  CaregiverChip,
  EditCareRecipientDialog,
  NewCareRecipientDialog,
  type CareRecipientRow,
} from "@/components/clients/care-recipients-card";

// A care agency's clients in its client workspace (docs/client-care-plan.md):
// a list on the left and the chosen client's whole page on the right,
// instead of the accordion the agency's own client page uses. The chosen
// client is in the address (?open=) so alert and roster links land on them.

type TaskRow = { id: string; title: string; dueDate: Date | null; caregiverName: string | null };
type Filter = "all" | "attention" | "unassigned";

const MINUTES_PER_WEEK = 7 * 24 * 60;

/** The next scheduled visit from now (workspace-local weekday/minute), if any. */
function nextVisit(shifts: CareRecipientRow["shifts"], now: { weekday: number; minute: number }) {
  let best: { inMinutes: number; shift: CareRecipientRow["shifts"][number] } | null = null;
  for (const s of shifts) {
    let inMinutes = (s.weekday - now.weekday) * 24 * 60 + s.startMinute - now.minute;
    if (inMinutes < 0) inMinutes += MINUTES_PER_WEEK;
    if (!best || inMinutes < best.inMinutes) best = { inMinutes, shift: s };
  }
  if (!best) return null;
  const days = Math.floor((now.minute + best.inMinutes) / (24 * 60));
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : WEEKDAY_SHORT[best.shift.weekday];
  return { label: `${day} ${formatMinuteOfDay(best.shift.startMinute)}`, caregiver: best.shift.caregiver.name };
}

function visitInProgress(r: CareRecipientRow) {
  const v = r.timeEntries[0];
  return v && (!v.clockOut || v.visitSegments.some((s) => !s.clockOut)) ? v : null;
}

const shortDate = (d: Date) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function CareClientsWorkspace({
  recipients,
  caregivers,
  openId,
  now,
  tasksByRecipient,
  canMakeTasks,
  today,
}: {
  /** Today's scheduled visits, and the late or missed ones (getCareVisitAlerts). */
  today: Pick<CareVisitAlerts, "scheduledToday" | "problems">;
  recipients: CareRecipientRow[];
  caregivers: { id: string; name: string }[];
  openId?: string;
  /** "Now" in the workspace's time zone, for the next scheduled visit. */
  now: { weekday: number; minute: number };
  tasksByRecipient: Record<string, TaskRow[]>;
  canMakeTasks: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(openId && recipients.some((r) => r.id === openId) ? openId : null);
  const [tab, setTab] = useState("overview");

  // Keep ?open= in the address so a refresh or a shared link shows the same client.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("open", selectedId);
    else url.searchParams.delete("open");
    window.history.replaceState(window.history.state, "", url);
  }, [selectedId]);

  const counts = useMemo(
    () => ({
      all: recipients.length,
      attention: recipients.filter((r) => r.incidents.some((i) => !i.resolvedAt)).length,
      unassigned: recipients.filter((r) => r.assignments.length === 0).length,
    }),
    [recipients],
  );
  const q = query.trim().toLowerCase();
  const shown = recipients.filter((r) => {
    if (filter === "attention" && !r.incidents.some((i) => !i.resolvedAt)) return false;
    if (filter === "unassigned" && r.assignments.length > 0) return false;
    return !q || r.name.toLowerCase().includes(q) || r.assignments.some((a) => a.caregiver.name.toLowerCase().includes(q));
  });
  // Wide screens always show someone; phones show the list until a client is picked.
  const selected = recipients.find((r) => r.id === selectedId) ?? null;
  const shownOnWide = selected ?? shown[0] ?? recipients[0] ?? null;

  if (recipients.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
        <Users className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-heading text-lg font-semibold">No clients yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add the people your caregivers visit. Then assign caregivers, set their weekly visits and the checklist caregivers tick off at each visit.
        </p>
        <NewCareRecipientDialog clientId={null} variant="workspace" primary />
        <ArchivedRecipients clientId={null} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {today.problems.length > 0 ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
            <CalendarClock className="size-4 text-amber-600" /> Today&apos;s visits that need a look
          </p>
          <ul className="flex flex-wrap gap-2">
            {today.problems.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.careRecipientId)}
                  className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                >
                  <span className="font-medium">{p.recipientName}</span>
                  <span className="text-muted-foreground">
                    {p.caregiverName.split(" ")[0]} · {formatShiftRange(p.startMinute, p.endMinute)}
                  </span>
                  <span className={p.status === "missed" ? "font-medium text-destructive" : "font-medium text-amber-700 dark:text-amber-400"}>
                    {p.status === "missed" ? "Missed" : "Late"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : today.scheduledToday > 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="size-4" /> {today.scheduledToday} visit{today.scheduledToday === 1 ? "" : "s"} scheduled today, all on track.
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className={cn("space-y-3 lg:sticky lg:top-4", selected && "hidden lg:block")}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients or caregivers" className="pl-8" aria-label="Search clients or caregivers" />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["attention", "Concerns"],
                ["unassigned", "No caregiver"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  filter === value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label} <span className="tabular-nums opacity-80">{counts[value]}</span>
              </button>
            ))}
          </div>
          <ul className="max-h-[calc(100vh-14rem)] divide-y overflow-y-auto rounded-xl border bg-card">
            {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nobody matches.</li>}
            {shown.map((r) => {
              const age = ageFromDob(r.dateOfBirth);
              const open = r.incidents.filter((i) => !i.resolvedAt);
              const live = visitInProgress(r);
              const active = shownOnWide?.id === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      active && "lg:bg-primary/8 lg:shadow-[inset_3px_0_0_var(--primary)]",
                    )}
                  >
                    <AvatarInitials name={r.name} className="size-9 shrink-0 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{r.name}</span>
                        {age !== null && <span className="shrink-0 text-xs text-muted-foreground">{age}</span>}
                      </span>
                      <span className={cn("block truncate text-xs", r.assignments.length ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
                        {r.assignments.length ? r.assignments.map((a) => a.caregiver.name.split(" ")[0]).join(", ") : "No caregiver yet"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {live && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden /> Visit now
                        </span>
                      )}
                      {open.length > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                            open.some((i) => i.urgent) ? "bg-destructive text-white" : "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                          )}
                        >
                          {open.length} concern{open.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <ArchivedRecipients clientId={null} />
        </aside>

        {shownOnWide && (
          <section className={cn("min-w-0", !selected && "hidden lg:block")} aria-label={shownOnWide.name}>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2 lg:hidden" onClick={() => setSelectedId(null)}>
              <ArrowLeft className="size-4" /> All clients
            </Button>
            <ClientDetail
              key={shownOnWide.id}
              r={shownOnWide}
              caregivers={caregivers}
              now={now}
              tasks={tasksByRecipient[shownOnWide.id] ?? []}
              canMakeTasks={canMakeTasks}
              tab={tab}
              onTab={setTab}
            />
          </section>
        )}
      </div>
    </div>
  );
}

function ClientDetail({
  r,
  caregivers,
  now,
  tasks,
  canMakeTasks,
  tab,
  onTab,
}: {
  r: CareRecipientRow;
  caregivers: { id: string; name: string }[];
  now: { weekday: number; minute: number };
  tasks: TaskRow[];
  canMakeTasks: boolean;
  tab: string;
  onTab: (t: string) => void;
}) {
  const age = ageFromDob(r.dateOfBirth);
  const openConcerns = r.incidents.filter((i) => !i.resolvedAt);
  const live = visitInProgress(r);
  const next = nextVisit(r.shifts, now);
  const lastFinished = r.timeEntries.find((v) => v.clockOut && v.visitSegments.every((s) => s.clockOut));
  const lastVisit = live ? r.timeEntries[1] : r.timeEntries[0];
  const lastChecked = lastFinished?.visitChecks.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AvatarInitials name={r.name} className="size-14 shrink-0 text-lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="font-heading text-xl font-semibold tracking-tight">{r.name}</h2>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
              {age !== null && <span>Age {age}</span>}
              {r.address && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{r.address}</span>
                </span>
              )}
              {r.phone && (
                <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 hover:underline">
                  <Phone className="size-3.5" /> {r.phone}
                </a>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <EditCareRecipientDialog recipient={r} variant="workspace" />
            <ArchiveRecipientButton id={r.id} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Right now">
            {live ? (
              <span className="text-emerald-700 dark:text-emerald-400">{live.user.name.split(" ")[0]} is there</span>
            ) : (
              <span className="text-muted-foreground">No visit</span>
            )}
          </Stat>
          <Stat label="Next visit">{next ? `${next.label} · ${next.caregiver.split(" ")[0]}` : <span className="text-muted-foreground">Not scheduled</span>}</Stat>
          <Stat label="Last visit">
            {lastVisit ? `${shortDate(lastVisit.clockIn)} · ${lastVisit.user.name.split(" ")[0]}` : <span className="text-muted-foreground">None yet</span>}
          </Stat>
          <Stat label="Checklist last visit">
            {r.instructions.length === 0 ? (
              <span className="text-muted-foreground">No checklist</span>
            ) : lastFinished ? (
              <span className={lastChecked < r.instructions.length ? "text-amber-700 dark:text-amber-400" : undefined}>
                {lastChecked} of {r.instructions.length} done
              </span>
            ) : (
              <span className="text-muted-foreground">{r.instructions.length} items</span>
            )}
          </Stat>
        </dl>
      </div>

      {openConcerns.length > 0 && <CareIncidents incidents={openConcerns} canMakeTask={canMakeTasks} />}

      <Tabs value={tab} onValueChange={(v) => onTab(String(v))} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="overview">
            <UserRound className="size-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <CalendarClock className="size-4" /> Schedule
          </TabsTrigger>
          <TabsTrigger value="checklist">
            <ClipboardCheck className="size-4" /> Checklist
          </TabsTrigger>
          <TabsTrigger value="visits">
            <History className="size-4" /> Visits
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <Panel title="About">
              <RecipientSummary recipient={r} />
            </Panel>
            <div className="space-y-4">
              <Panel title="Caregivers">
                <div className="space-y-2">
                  {r.assignments.length === 0 ? (
                    <p className="text-sm text-amber-700 dark:text-amber-400">Nobody is assigned yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {r.assignments.map((a) => (
                        <CaregiverChip key={a.caregiver.id} careRecipientId={r.id} caregiver={a.caregiver} />
                      ))}
                    </div>
                  )}
                  <AssignCaregiverControl careRecipientId={r.id} caregivers={caregivers} alreadyAssigned={r.assignments.map((a) => a.caregiver.id)} />
                </div>
              </Panel>
              {tasks.length > 0 && (
                <Panel title="Open tasks">
                  <ul className="space-y-1.5 text-sm">
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <Link href={`/work/tasks/${t.id}`} className="hover:underline">
                          {t.title}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {[t.caregiverName, t.dueDate && `due ${new Date(t.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <Panel>
            <VisitScheduleEditor careRecipientId={r.id} shifts={r.shifts} assignedCaregivers={r.assignments.map((a) => a.caregiver)} />
          </Panel>
        </TabsContent>

        <TabsContent value="checklist">
          <Panel>
            <CareInstructionChecklist careRecipientId={r.id} instructions={r.instructions} canManage lastVisitCheckedIds={lastFinished?.visitChecks.map((c) => c.instructionId)} />
          </Panel>
        </TabsContent>

        <TabsContent value="visits" className="space-y-4">
          <Panel>
            <RecentVisits visits={r.timeEntries} recipient={r} instructionCount={r.instructions.length} />
          </Panel>
          {r.incidents.some((i) => i.resolvedAt) && (
            <Panel title="Resolved concerns">
              <CareIncidents incidents={r.incidents.filter((i) => i.resolvedAt)} canMakeTask={false} />
            </Panel>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      {title && <h3 className="mb-3 text-sm font-semibold">{title}</h3>}
      {children}
    </div>
  );
}
