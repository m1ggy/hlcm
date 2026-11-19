"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, EyeOff, FileText, MessageSquare, Pencil, Printer, Settings2, Sparkles, X } from "lucide-react";
import { regenerateSummaryNoteAction, saveSummaryNoteAction, setDayTextSkipAction, updateSummarySettingsAction } from "@/lib/actions/work-summary";
import { WORK_TASK_STATUS_LABELS, noteBullets, type WorkScope, type WorkTaskStatus } from "@/lib/work";
import type { DaySummary, SummaryPerson, WeekSummary } from "@/lib/work-summary";
import { filterDayToPerson, groupDayByPerson, personDayCount, type PersonDay, type PersonEvent } from "@/lib/work-summary-people";
import type { CareWeek } from "@/lib/care-summary";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { TaskSheet } from "./task-sheet";

/** Small uppercase labels (header, stats, days, sections): closer to the text color than muted, so they read in both themes. */
const SUBTITLE = "text-[0.8125rem] font-semibold tracking-wide text-foreground/80 uppercase";

type Settings = {
  showHoursToClient: boolean;
  aiSummaries: boolean;
  weeklyEmail: boolean;
  aiConfigured: boolean;
  /** Evening text of the day's note, whether texting works on this server, and how many of the client's people signed up. */
  dailyText: boolean;
  smsConfigured: boolean;
  textPeople: number;
};
type Note = WeekSummary["note"];

const fmt = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const time = (d: Date) => new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const status = (s: string | null) => (s && s in WORK_TASK_STATUS_LABELS ? WORK_TASK_STATUS_LABELS[s as WorkTaskStatus] : s ?? "");

function headline(d: DaySummary) {
  const parts: string[] = [];
  if (d.completed.length) parts.push(`${d.completed.length} finished`);
  if (d.progressed.length) parts.push(`${d.progressed.length} moved forward`);
  if (d.added.length) parts.push(`${d.added.length} new`);
  if (d.comments.length) parts.push(`${d.comments.length} ${d.comments.length === 1 ? "comment" : "comments"}`);
  if (d.files.length) parts.push(`${d.files.length} ${d.files.length === 1 ? "file" : "files"}`);
  if (d.updates.length) parts.push(`${d.updates.length} ${d.updates.length === 1 ? "update" : "updates"}`);
  return parts.join(" · ");
}
const isActive = (d: DaySummary) => d.completed.length + d.progressed.length + d.added.length + d.comments.length + d.files.length + d.updates.length > 0;

export function SummaryView({
  summary,
  today,
  initialDay,
  initialPerson,
  scope,
  currentUserId,
  people,
  workspaceName,
  isNew,
  settings,
  care,
}: {
  summary: WeekSummary;
  today: string;
  initialDay: string | null;
  /** The team's filter to one of its people (docs/summary-by-person-plan.md). */
  initialPerson?: string | null;
  scope: WorkScope;
  currentUserId: string;
  people: { id: string; name: string }[];
  workspaceName: string;
  /** Nothing has happened in the workspace yet: explain the page. */
  isNew: boolean;
  settings: Settings;
  /** A care agency's visits and concerns this week (docs/client-care-plan.md). */
  care?: CareWeek | null;
}) {
  const router = useRouter();
  const [day, setDay] = useState<string | null>(initialDay);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(initialPerson ?? null);
  const canEdit = scope.canManageProjects;
  const aiAvailable = settings.aiConfigured && settings.aiSummaries;
  const thisMonday = shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const hoursHidden = scope.side === "team" && !settings.showHoursToClient;

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const url = new URL(window.location.href);
      url.searchParams.set("week", summary.from);
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
      window.history.replaceState(null, "", url);
    },
    [summary.from]
  );
  const pickDay = useCallback(
    (d: string | null) => {
      setDay(d);
      setParam("day", d);
      if (d) requestAnimationFrame(() => document.getElementById("day-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    [setParam]
  );
  const pickPerson = useCallback(
    (id: string | null) => {
      setPerson(id);
      setParam("person", id);
    },
    [setParam]
  );
  // Week links keep the person filter.
  const weekHref = (monday: string | null) => {
    const q = new URLSearchParams();
    if (monday) q.set("week", monday);
    if (person) q.set("person", person);
    const qs = q.toString();
    return `/work/summary${qs ? `?${qs}` : ""}`;
  };
  const onSheetOpenChange = useCallback((open: boolean) => !open && setTaskId(null), []);

  const days = useMemo(() => (person ? summary.days.map((d) => filterDayToPerson(d, person)) : summary.days), [summary.days, person]);
  const selected = days.find((d) => d.date === day) ?? null;
  const t = useMemo(() => {
    if (!person) return summary.totals;
    const sum = (f: (d: DaySummary) => number) => days.reduce((s, d) => s + f(d), 0);
    return {
      completed: sum((d) => d.completed.length),
      progressed: sum((d) => d.progressed.length),
      added: sum((d) => d.added.length),
      comments: sum((d) => d.comments.length),
      files: sum((d) => d.files.length),
      hours: summary.totals.hours === null ? null : Math.round(sum((d) => d.hours ?? 0) * 100) / 100,
    };
  }, [person, days, summary.totals]);
  const filteredTo = person ? summary.people.find((p) => p.id === person) : null;
  const team = summary.people.filter((p) => p.side === "team");
  const sameMonth = summary.from.slice(0, 7) === summary.to.slice(0, 7);
  const title = `${fmt(summary.from, { month: "short", day: "numeric" })} – ${fmt(summary.to, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}, ${summary.to.slice(0, 4)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div data-tour="summary-header">
          <p className={SUBTITLE}>{workspaceName} · Weekly summary</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Week of {title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-print-hide>
          <Button variant="outline" size="icon" nativeButton={false} aria-label="Previous week" render={<Link href={weekHref(shift(summary.from, -7))} />}>
            <ChevronLeft className="size-4" />
          </Button>
          {summary.from !== thisMonday && (
            <Button variant="outline" nativeButton={false} render={<Link href={weekHref(null)} />}>
              This week
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            nativeButton={false}
            disabled={summary.from >= thisMonday}
            render={<Link href={weekHref(shift(summary.from, 7))} aria-disabled={summary.from >= thisMonday} />}
            className={cn(summary.from >= thisMonday && "pointer-events-none opacity-50")}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Input
            type="date"
            aria-label="Go to a date"
            className="w-40"
            max={today}
            defaultValue={summary.from}
            onChange={(e) => e.target.value && router.push(weekHref(e.target.value))}
          />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {canEdit && <SettingsDialog settings={settings} />}
        </div>
      </div>

      {isNew && <Welcome side={scope.side} canEdit={canEdit} aiOn={aiAvailable} />}

      {filteredTo && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          <AvatarInitials name={filteredTo.name} className="size-6 text-[0.625rem]" />
          <span>
            Showing only <span className="font-semibold">{filteredTo.name}</span>&apos;s work. The week&apos;s note covers everyone.
          </span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => pickPerson(null)} data-print-hide>
            <X className="size-3.5" /> Show everyone
          </Button>
        </div>
      )}

      {/* The week's paragraph */}
      <NoteBlock
        key={`week-${summary.from}`}
        period="WEEK"
        day={summary.from}
        note={summary.note}
        canEdit={canEdit}
        aiAvailable={aiAvailable}
        emptyText={canEdit ? "No summary for this week yet." : null}
        className="rounded-xl border bg-card p-5"
        textClassName="text-base leading-relaxed"
      />

      {/* Totals */}
      <section aria-label="This week in numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Finished" value={t.completed} days={days.map((d) => d.completed.length)} />
        <Stat label="Moved forward" value={t.progressed} days={days.map((d) => d.progressed.length)} />
        <Stat label="New tasks" value={t.added} days={days.map((d) => d.added.length)} />
        <Stat label="Comments" value={t.comments} days={days.map((d) => d.comments.length)} />
        <Stat label="Files shared" value={t.files} days={days.map((d) => d.files.length)} />
        {t.hours !== null && (
          <Stat
            label="Hours"
            value={t.hours}
            days={days.map((d) => d.hours ?? 0)}
            mono
            hint={hoursHidden ? "Only your team sees hours" : undefined}
          />
        )}
      </section>

      {care && (
        <section aria-label="Care visits this week" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">Care visits</h2>
            <Link href="/care-recipients" className="text-sm text-muted-foreground hover:underline" data-print-hide>
              Clients
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Visits" value={care.visits} days={care.days.map((d) => d.visits)} />
            <Stat label="Visit hours" value={care.visitHours} days={care.days.map((d) => d.visits)} mono />
            <Stat label="Missed" value={care.missed} days={care.days.map((d) => d.missed)} />
            <Stat label="Concerns raised" value={care.concernsRaised} days={care.days.map(() => 0)} />
            <Stat label="Open concerns" value={care.openConcerns} days={care.days.map(() => 0)} />
          </div>
        </section>
      )}

      {scope.side === "team" && team.length > 0 && (
        <WhoWorked summary={summary} team={team} today={today} person={person} onPick={(id) => pickPerson(id === person ? null : id)} />
      )}

      {/* Days */}
      <section aria-label="Days" data-tour="summary-days" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {days.map((d) => (
          <DayCard
            key={d.date}
            d={d}
            people={summary.people}
            today={today}
            selected={d.date === day}
            showNote={!person}
            onSelect={() => pickDay(d.date === day ? null : d.date)}
          />
        ))}
      </section>

      {selected && (
        <DayDetail
          key={selected.date}
          d={selected}
          people={summary.people}
          clientName={workspaceName}
          filtered={Boolean(person)}
          canEdit={canEdit}
          aiAvailable={aiAvailable}
          hoursHidden={hoursHidden}
          textInfo={canEdit && settings.dailyText ? { isToday: selected.date === today, people: settings.textPeople } : null}
          onOpenTask={setTaskId}
          onClose={() => pickDay(null)}
        />
      )}

      <TaskSheet taskId={taskId} onOpenChange={onSheetOpenChange} onOpenTask={setTaskId} scope={scope} currentUserId={currentUserId} people={people} />
    </div>
  );
}

// A brand-new workspace (docs/workspace-tasks-plan.md, Phase 4): what this
// page is, until the first thing happens.
function Welcome({ side, canEdit, aiOn }: { side: WorkScope["side"]; canEdit: boolean; aiOn: boolean }) {
  const client = side === "client";
  return (
    <section className="rounded-xl border border-primary/30 bg-primary/5 p-5" aria-label="Welcome">
      <h2 className="font-heading text-lg font-semibold">{client ? "Welcome — this is your weekly summary" : "This is the client's weekly summary"}</h2>
      <div className="mt-2 max-w-3xl space-y-2 text-sm text-muted-foreground">
        <p>
          {client
            ? "Each day card below fills in as your team works: tasks finished, moved forward or added, comments and files shared with you. Click a day for the details, or use the arrows to look back at any week."
            : "It's what the client sees when they sign in: each day card fills in from tasks finished, moved forward or added, and the comments and files you share with them. Hidden tasks and internal comments never show here."}
        </p>
        <p>
          {client
            ? `${aiOn ? "A short written note sums up each day and week, and every" : "Every"} Monday morning you get last week's summary by email.`
            : canEdit
              ? `${aiOn ? "Claude drafts a short note for each day and week; edit or rewrite any of them." : "Write a short note for any day or week."} The client gets last week's summary by email every Monday — change that and hours in Settings.`
              : "Your managers can add a short note to each day and week."}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" data-print-hide>
        <Button size="sm" nativeButton={false} render={<Link href="/work" />}>
          {client ? "See your projects" : canEdit ? "Set up projects" : "See projects"}
        </Button>
      </div>
    </section>
  );
}

function Stat({ label, value, days, mono, hint }: { label: string; value: number; days: number[]; mono?: boolean; hint?: string }) {
  const max = Math.max(...days, 0);
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className={SUBTITLE}>{label}</p>
      <p className={cn("mt-1 font-heading text-2xl font-semibold tabular-nums", mono && "font-mono text-xl")}>{mono ? `${value}h` : value}</p>
      <div className="mt-2 flex h-6 items-end gap-0.5" aria-hidden>
        {days.map((n, i) => (
          <span key={i} className={cn("flex-1 rounded-sm", n > 0 ? "bg-primary/70" : "bg-muted")} style={{ height: `${max ? Math.max(12, (n / max) * 100) : 12}%` }} />
        ))}
      </div>
      {hint && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <EyeOff className="size-3" /> {hint}
        </p>
      )}
    </div>
  );
}

/** Who did something on a day: anyone with an item, or (for the team) tracked hours. */
function activePeople(d: DaySummary, people: SummaryPerson[]) {
  const ids = new Set<string>();
  for (const list of [d.completed, d.progressed, d.added, d.comments, d.files, d.updates]) for (const i of list) ids.add(i.byId);
  if (d.hoursBy) for (const [id, h] of Object.entries(d.hoursBy)) if (h > 0) ids.add(id);
  return people.filter((p) => ids.has(p.id));
}

function DayCard({
  d,
  people,
  today,
  selected,
  showNote,
  onSelect,
}: {
  d: DaySummary;
  people: SummaryPerson[];
  today: string;
  selected: boolean;
  /** Off while filtered to one person: the note covers everyone. */
  showNote: boolean;
  onSelect: () => void;
}) {
  const active = isActive(d);
  const future = d.date > today;
  const isToday = d.date === today;
  const who = active ? activePeople(d, people) : [];
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={future}
      aria-pressed={selected}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-ring/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none",
        isToday && "border-t-2 border-t-marigold",
        selected && "border-ring ring-1 ring-ring",
        (!active || future) && "bg-muted/40"
      )}
    >
      <span className={SUBTITLE}>
        {fmt(d.date, { weekday: "short", month: "short", day: "numeric" })}
        {isToday && " · Today"}
      </span>
      {future ? (
        <span className="text-sm text-muted-foreground">Not yet</span>
      ) : !active ? (
        <span className="text-sm text-muted-foreground">No updates</span>
      ) : (
        <>
          <span className="font-heading text-base font-semibold">{headline(d)}</span>
          {showNote && d.note && <span className="line-clamp-3 text-sm">{d.note.body}</span>}
          {who.length > 0 && (
            <span className="flex items-center gap-1.5" aria-label={`${who.length} ${who.length === 1 ? "person" : "people"}: ${who.map((p) => p.name).join(", ")}`}>
              <span className="flex -space-x-1" aria-hidden>
                {who.slice(0, 5).map((p) => (
                  <AvatarInitials key={p.id} name={p.name} className="size-6 text-[0.625rem] ring-2 ring-card" />
                ))}
              </span>
              {who.length > 5 && <span className="text-xs text-muted-foreground">+{who.length - 5}</span>}
            </span>
          )}
          {d.hours !== null && d.hours > 0 && <span className="font-mono text-xs text-muted-foreground tabular-nums">{d.hours}h</span>}
        </>
      )}
    </button>
  );
}

function TaskLink({ id, title, onOpen }: { id: string; title: string; onOpen: (id: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(id)} className="text-left font-medium underline-offset-2 hover:underline">
      {title}
    </button>
  );
}

function DayDetail({
  d,
  people,
  clientName,
  filtered,
  canEdit,
  aiAvailable,
  hoursHidden,
  textInfo,
  onOpenTask,
  onClose,
}: {
  d: DaySummary;
  people: SummaryPerson[];
  /** The client's name, for their own people's group. */
  clientName: string;
  /** Filtered to one person: the switch and the group headings aren't needed. */
  filtered: boolean;
  canEdit: boolean;
  aiAvailable: boolean;
  hoursHidden: boolean;
  /** For the team when the evening text is on. */
  textInfo: { isToday: boolean; people: number } | null;
  onOpenTask: (id: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"person" | "type">("person");
  return (
    <section id="day-detail" className="scroll-mt-4 space-y-5 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{fmt(d.date, { weekday: "long", month: "long", day: "numeric" })}</h2>
        <div className="flex items-center gap-2" data-print-hide>
          {isActive(d) && !filtered && (
            <div role="group" aria-label="Group the day" className="inline-flex rounded-lg border p-0.5">
              {(["person", "type"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={cn("rounded-md px-2.5 py-1 text-sm transition-colors", view === v ? "bg-secondary font-medium text-secondary-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {v === "person" ? "By person" : "By type"}
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <NoteBlock period="DAY" day={d.date} note={d.note} canEdit={canEdit} aiAvailable={aiAvailable && isActive(d)} emptyText={canEdit ? "No note for this day yet." : null} />
      {textInfo && <DayText d={d} {...textInfo} />}
      {!isActive(d) && <p className="text-sm text-muted-foreground">Nothing was updated this day.</p>}

      {isActive(d) &&
        (view === "person" || filtered ? (
          <ByPerson d={d} people={people} clientName={clientName} hoursHidden={hoursHidden} onOpenTask={onOpenTask} />
        ) : (
          <ByType d={d} onOpenTask={onOpenTask} />
        ))}
      {d.hours !== null && d.hours > 0 && (
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {d.hours}h of work{hoursHidden && " (only your team sees hours)"}
        </p>
      )}
    </section>
  );
}

/** The day by kind of event, everyone together (the page's first layout). */
function ByType({ d, onOpenTask }: { d: DaySummary; onOpenTask: (id: string) => void }) {
  const byProject = <T extends { projectName: string }>(items: T[]) => {
    const groups = new Map<string, T[]>();
    for (const i of items) groups.set(i.projectName, [...(groups.get(i.projectName) ?? []), i]);
    return [...groups.entries()];
  };
  return (
    <div className="space-y-5">
      {d.completed.length > 0 && (
        <DetailList title="Finished">
          {byProject(d.completed).map(([project, items]) => (
            <li key={project}>
              <p className="text-xs font-medium text-foreground/75">{project}</p>
              <ul className="space-y-1">
                {items.map((c) => (
                  <li key={c.taskId + c.at.toString()} className="text-sm">
                    ✓ <TaskLink id={c.taskId} title={c.title} onOpen={onOpenTask} /> <span className="text-muted-foreground">· {c.by}, {time(c.at)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </DetailList>
      )}
      {d.updates.length > 0 && (
        <DetailList title="Updates from the team">
          {d.updates.map((u) => (
            <li key={u.taskId + u.at.toString()} className="text-sm">
              <p className="text-muted-foreground">
                {u.by} on <TaskLink id={u.taskId} title={u.title} onOpen={onOpenTask} />
              </p>
              <p className="whitespace-pre-wrap">{u.text}</p>
            </li>
          ))}
        </DetailList>
      )}
      {d.progressed.length > 0 && (
        <DetailList title="Moved forward">
          {d.progressed.map((p) => (
            <li key={p.taskId + p.at.toString()} className="text-sm">
              <TaskLink id={p.taskId} title={p.title} onOpen={onOpenTask} />{" "}
              <span className="text-muted-foreground">
                ({p.projectName}) {p.declined ? "· request declined" : `· ${status(p.from)} → ${status(p.to)}`} · {p.by}, {time(p.at)}
              </span>
            </li>
          ))}
        </DetailList>
      )}
      {d.added.length > 0 && (
        <DetailList title="New">
          {d.added.map((a) => (
            <li key={a.taskId} className="text-sm">
              <TaskLink id={a.taskId} title={a.title} onOpen={onOpenTask} />{" "}
              <span className="text-muted-foreground">
                ({a.projectName}) · {a.requested ? "requested" : "added"} by {a.by}
              </span>
            </li>
          ))}
        </DetailList>
      )}
      {d.comments.length > 0 && (
        <DetailList title="Comments">
          {d.comments.map((c) => (
            <li key={c.taskId + c.at.toString()} className="text-sm">
              <p className="text-muted-foreground">
                {c.by} on <TaskLink id={c.taskId} title={c.title} onOpen={onOpenTask} />, {time(c.at)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </DetailList>
      )}
      {d.files.length > 0 && (
        <DetailList title="Files shared">
          {d.files.map((f) => (
            <li key={f.taskId + f.fileName + f.at.toString()} className="text-sm">
              {f.fileName} <span className="text-muted-foreground">on</span> <TaskLink id={f.taskId} title={f.title} onOpen={onOpenTask} />{" "}
              <span className="text-muted-foreground">· {f.by}</span>
            </li>
          ))}
        </DetailList>
      )}
    </div>
  );
}

/** True while the browser prints, so every card prints opened up. */
function usePrinting() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    return () => {
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
    };
  }, []);
  return printing;
}

/** The day by who did it (docs/summary-by-person-plan.md): the team, then the client's own people. */
function ByPerson({
  d,
  people,
  clientName,
  hoursHidden,
  onOpenTask,
}: {
  d: DaySummary;
  people: SummaryPerson[];
  clientName: string;
  hoursHidden: boolean;
  onOpenTask: (id: string) => void;
}) {
  const { team, client } = useMemo(() => groupDayByPerson(d, people), [d, people]);
  // A busy day starts with each person folded to their one-line summary.
  const startOpen = team.length + client.length <= 3;
  return (
    <div className="space-y-5">
      {team.length > 0 && (
        <div className="space-y-2">
          {client.length > 0 && <h3 className={SUBTITLE}>The team</h3>}
          {team.map((p) => (
            <PersonCard key={`${p.id}-${startOpen}`} p={p} startOpen={startOpen} hoursHidden={hoursHidden} onOpenTask={onOpenTask} />
          ))}
        </div>
      )}
      {client.length > 0 && (
        <div className="space-y-2">
          <h3 className={SUBTITLE}>From {clientName}</h3>
          {client.map((p) => (
            <PersonCard key={`${p.id}-${startOpen}`} p={p} startOpen={startOpen} hoursHidden={hoursHidden} onOpenTask={onOpenTask} />
          ))}
        </div>
      )}
    </div>
  );
}

const TASKS_SHOWN = 5;

function personLine(p: PersonDay) {
  const c = p.counts;
  const parts: string[] = [];
  if (c.completed) parts.push(`${c.completed} finished`);
  if (c.progressed) parts.push(`${c.progressed} moved forward`);
  if (c.added) parts.push(`${c.added} new`);
  if (c.updates) parts.push(`${c.updates} ${c.updates === 1 ? "update" : "updates"}`);
  if (c.comments) parts.push(`${c.comments} ${c.comments === 1 ? "comment" : "comments"}`);
  if (c.files) parts.push(`${c.files} ${c.files === 1 ? "file" : "files"}`);
  return parts.join(" · ") || "Tracked time only";
}

function PersonCard({ p, startOpen, hoursHidden, onOpenTask }: { p: PersonDay; startOpen: boolean; hoursHidden: boolean; onOpenTask: (id: string) => void }) {
  const [open, setOpen] = useState(startOpen);
  const [all, setAll] = useState(false);
  const printing = usePrinting();
  const shown = open || printing;
  const tasks = all || printing ? p.tasks : p.tasks.slice(0, TASKS_SHOWN);
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={shown}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <AvatarInitials name={p.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.name}</span>
          <span className="block truncate text-sm text-muted-foreground">{personLine(p)}</span>
        </span>
        {p.hours !== null && p.hours > 0 && (
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground" title={hoursHidden ? "Only your team sees hours" : undefined}>
            {Math.round(p.hours * 100) / 100}h
          </span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", shown && "rotate-180")} data-print-hide />
      </button>
      {shown && p.tasks.length > 0 && (
        <ul className="divide-y border-t">
          {tasks.map((t) => (
            <PersonTaskRow key={t.taskId} t={t} onOpenTask={onOpenTask} />
          ))}
          {!all && !printing && p.tasks.length > TASKS_SHOWN && (
            <li className="px-3 py-2" data-print-hide>
              <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
                Show {p.tasks.length - TASKS_SHOWN} more {p.tasks.length - TASKS_SHOWN === 1 ? "task" : "tasks"}
              </Button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** A short label for a status-like event: "Finished", "To do → In progress". */
function eventChip(e: PersonEvent) {
  switch (e.kind) {
    case "finished":
      return "✓ Finished";
    case "moved":
      return `${status(e.from)} → ${status(e.to)}`;
    case "declined":
      return "Request declined";
    case "added":
      return e.requested ? "Requested" : "Added";
    default:
      return null;
  }
}

function PersonTaskRow({ t, onOpenTask }: { t: PersonDay["tasks"][number]; onOpenTask: (id: string) => void }) {
  // The same label twice in a day (moved back and forth, finished twice) shows once.
  const chips = t.events.filter((e, i, all) => eventChip(e) && all.findIndex((o) => eventChip(o) === eventChip(e)) === i);
  const files = t.events.filter((e) => e.kind === "file");
  const texts = t.events.filter((e) => e.kind === "update" || e.kind === "comment");
  return (
    <li className="space-y-1.5 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <TaskLink id={t.taskId} title={t.title} onOpen={onOpenTask} />
        <span className="text-xs text-muted-foreground">{t.projectName}</span>
      </div>
      {(chips.length > 0 || files.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((e, i) => (
            <Badge key={i} variant={e.kind === "finished" ? "default" : "secondary"} className="font-normal" title={time(e.at)}>
              {eventChip(e)}
            </Badge>
          ))}
          {files.map((e, i) => (
            <Badge key={`f${i}`} variant="outline" className="gap-1 font-normal" title={time(e.at)}>
              <FileText className="size-3" /> {e.kind === "file" ? e.fileName : ""}
            </Badge>
          ))}
        </div>
      )}
      {texts.map((e, i) => (
        <div key={i} className="border-l-2 pl-3">
          <p className="text-xs text-muted-foreground">
            {e.kind === "update" ? "Update" : "Comment"} · {time(e.at)}
          </p>
          <p className="whitespace-pre-wrap">{e.kind === "update" ? e.text : e.kind === "comment" ? e.body : ""}</p>
        </div>
      ))}
    </li>
  );
}

/** The team's week by person: who did how much each day; click someone to see only their work. */
function WhoWorked({
  summary,
  team,
  today,
  person,
  onPick,
}: {
  summary: WeekSummary;
  team: SummaryPerson[];
  today: string;
  person: string | null;
  onPick: (id: string) => void;
}) {
  const rows = team
    .map((p) => {
      const counts = summary.days.map((d) => personDayCount(d, p.id));
      const hours = summary.days.map((d) => (d.hoursBy ? (d.hoursBy[p.id] ?? 0) : null));
      return {
        p,
        counts,
        hours,
        total: counts.reduce((s, n) => s + n, 0),
        totalHours: hours.every((h) => h === null) ? null : Math.round(hours.reduce((s: number, h) => s + (h ?? 0), 0) * 100) / 100,
      };
    })
    .sort((a, b) => b.total - a.total || (b.totalHours ?? 0) - (a.totalHours ?? 0) || a.p.name.localeCompare(b.p.name));
  const max = Math.max(1, ...rows.flatMap((r) => r.counts));
  return (
    <section aria-label="Who worked this week" className="space-y-2" data-print-hide>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Who worked</h2>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <EyeOff className="size-3" /> Only your team sees this
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-3 py-2 font-medium text-muted-foreground">Person</th>
              {summary.days.map((d) => (
                <th key={d.date} className={cn("px-1 py-2 text-center font-medium text-muted-foreground", d.date === today && "text-foreground")}>
                  {fmt(d.date, { weekday: "short" })}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Week</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, counts, hours, total, totalHours }) => (
              <tr
                key={p.id}
                onClick={() => onPick(p.id)}
                className={cn("cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50", person === p.id && "bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)]")}
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-pressed={person === p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPick(p.id);
                    }}
                    className="flex items-center gap-2 text-left font-medium focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <AvatarInitials name={p.name} className="size-6 text-[0.625rem]" />
                    <span className="truncate">{p.name}</span>
                  </button>
                </td>
                {counts.map((n, i) => (
                  <td key={i} className="px-1 py-1.5 text-center">
                    <span
                      className={cn(
                        "mx-auto flex h-9 w-11 flex-col items-center justify-center rounded-md tabular-nums",
                        n > 0 ? (n / max > 0.66 ? "bg-primary/45" : n / max > 0.33 ? "bg-primary/30" : "bg-primary/15") : "bg-muted/60 text-muted-foreground"
                      )}
                    >
                      <span className={cn(n > 0 && "font-semibold")}>{n || "–"}</span>
                      {hours[i] !== null && (hours[i] ?? 0) > 0 && <span className="font-mono text-[0.625rem] leading-none text-foreground/70">{Math.round((hours[i] ?? 0) * 10) / 10}h</span>}
                    </span>
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">
                  <span className="font-semibold">{total}</span>
                  {totalHours !== null && totalHours > 0 && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{totalHours}h</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The team's view of a day's evening text: sent, or (today) a switch to skip it. */
function DayText({ d, isToday, people }: { d: DaySummary; isToday: boolean; people: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  if (d.text.sentAt) {
    const n = d.text.sentTo ?? 0;
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground" data-print-hide>
        <MessageSquare className="size-3.5" />
        {n > 0 ? `Texted to ${n} ${n === 1 ? "person" : "people"} at ${time(d.text.sentAt)}` : "Nobody was signed up for texts when this day's update went out"}
      </p>
    );
  }
  if (!isToday) return null;
  return (
    <label className="flex items-start gap-2 text-sm" data-print-hide>
      <Checkbox
        checked={!d.text.skip}
        disabled={isPending}
        className="mt-0.5"
        onCheckedChange={(v) =>
          startTransition(async () => {
            const r = await setDayTextSkipAction(d.date, !v);
            if (!r.ok) return void toast.error(r.error);
            toast.success(v ? "Tonight's text is back on" : "No text tonight");
            router.refresh();
          })
        }
      />
      <span>
        Text today&apos;s update to the client tonight
        <span className="block text-xs text-muted-foreground">
          {people === 0
            ? "Nobody has signed up for texts yet. The client's people turn them on in their Account settings."
            : `Around 8 pm, to ${people} ${people === 1 ? "person" : "people"}, with the note above (or a short list if there's no note). Skipped if nothing happened.`}
        </span>
      </span>
    </label>
  );
}

function DetailList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className={SUBTITLE}>{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

const SOURCE_LABEL = { AI: "Written by AI", EDITED: "Written by AI, edited", HUMAN: null } as const;

function NoteText({ body, className }: { body: string; className?: string }) {
  const bullets = noteBullets(body);
  if (!bullets) return <p className={cn("text-sm whitespace-pre-wrap", className)}>{body}</p>;
  return (
    <ul className={cn("list-disc space-y-1 pl-5 text-sm", className)}>
      {bullets.map((b, i) => (
        <li key={i}>{b}</li>
      ))}
    </ul>
  );
}

function NoteBlock({
  period,
  day,
  note,
  canEdit,
  aiAvailable,
  emptyText,
  className,
  textClassName,
}: {
  period: "DAY" | "WEEK";
  day: string;
  note: Note;
  canEdit: boolean;
  aiAvailable: boolean;
  emptyText: string | null;
  className?: string;
  textClassName?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note?.body ?? "");
  const [isPending, startTransition] = useTransition();

  if (!note && !canEdit) return null;

  function save() {
    startTransition(async () => {
      const r = await saveSummaryNoteAction(period, day, text);
      if (!r.ok) return void toast.error(r.error);
      setEditing(false);
      toast.success("Saved");
      router.refresh();
    });
  }
  function rewrite() {
    startTransition(async () => {
      const r = await regenerateSummaryNoteAction(period, day);
      if (!r.ok) return void toast.error(r.error);
      setText(r.data.text);
      toast.success("Summary written");
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-2", className)}>
      {editing ? (
        <>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={period === "WEEK" ? 6 : 3} aria-label={period === "WEEK" ? "Week summary" : "Day note"} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} loading={isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : note ? (
        <NoteText body={note.body} className={textClassName} />
      ) : (
        emptyText && <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
      {!editing && (note || canEdit) && (
        <div className="flex flex-wrap items-center gap-2" data-print-hide>
          {note && SOURCE_LABEL[note.source] && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3" /> {SOURCE_LABEL[note.source]}
            </Badge>
          )}
          {canEdit && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> {note ? "Edit" : "Write one"}
              </Button>
              {aiAvailable && (
                <Button size="sm" variant="ghost" onClick={rewrite} loading={isPending}>
                  <Sparkles className="size-3.5" /> {note ? "Rewrite with AI" : "Write with AI"}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsDialog({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function set(input: Parameters<typeof updateSummarySettingsAction>[0]) {
    startTransition(async () => {
      const r = await updateSummarySettingsAction(input);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Settings saved");
      router.refresh();
    });
  }
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon" aria-label="Summary settings" data-tour="summary-settings">
            <Settings2 className="size-4" />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Summary settings</DialogTitle>
          <DialogDescription>For this workspace. The client sees the summary; only your team can change these.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={settings.showHoursToClient} disabled={isPending} onCheckedChange={(v) => set({ showHoursToClient: Boolean(v) })} className="mt-0.5" />
            <span>
              Show hours to the client
              <span className="block text-xs text-muted-foreground">Tracked time on tasks, per day and for the week.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={settings.aiSummaries} disabled={isPending} onCheckedChange={(v) => set({ aiSummaries: Boolean(v) })} className="mt-0.5" />
            <span>
              AI-written daily and weekly notes
              <span className="block text-xs text-muted-foreground">
                {settings.aiConfigured
                  ? "Written each evening from what the client can see. Edit any note; edited notes are never replaced."
                  : "Not set up on this server yet, so no notes are written."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={settings.weeklyEmail} disabled={isPending} onCheckedChange={(v) => set({ weeklyEmail: Boolean(v) })} className="mt-0.5" />
            <span>
              Monday email to the client
              <span className="block text-xs text-muted-foreground">Last week&apos;s summary, sent Monday morning. Quiet weeks are skipped.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={settings.dailyText} disabled={isPending} onCheckedChange={(v) => set({ dailyText: Boolean(v) })} className="mt-0.5" />
            <span>
              Evening text to the client
              <span className="block text-xs text-muted-foreground">
                {!settings.smsConfigured
                  ? "Texting isn't set up on this server yet, so no texts are sent."
                  : `Around 8 pm on days with updates, the day's note goes by text to the client's people who signed up in their Account settings (${settings.textPeople} so far). You can skip any day.`}
              </span>
            </span>
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
