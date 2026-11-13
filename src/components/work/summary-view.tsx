"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, EyeOff, MessageSquare, Pencil, Printer, Settings2, Sparkles } from "lucide-react";
import { regenerateSummaryNoteAction, saveSummaryNoteAction, setDayTextSkipAction, updateSummarySettingsAction } from "@/lib/actions/work-summary";
import { WORK_TASK_STATUS_LABELS, type WorkScope, type WorkTaskStatus } from "@/lib/work";
import type { DaySummary, WeekSummary } from "@/lib/work-summary";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  scope,
  currentUserId,
  people,
  workspaceName,
  isNew,
  settings,
}: {
  summary: WeekSummary;
  today: string;
  initialDay: string | null;
  scope: WorkScope;
  currentUserId: string;
  people: { id: string; name: string }[];
  workspaceName: string;
  /** Nothing has happened in the workspace yet: explain the page. */
  isNew: boolean;
  settings: Settings;
}) {
  const router = useRouter();
  const [day, setDay] = useState<string | null>(initialDay);
  const [taskId, setTaskId] = useState<string | null>(null);
  const canEdit = scope.canManageProjects;
  const aiAvailable = settings.aiConfigured && settings.aiSummaries;
  const thisMonday = shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const hoursHidden = scope.side === "team" && !settings.showHoursToClient;

  const pickDay = useCallback((d: string | null) => {
    setDay(d);
    const url = new URL(window.location.href);
    url.searchParams.set("week", summary.from);
    if (d) url.searchParams.set("day", d);
    else url.searchParams.delete("day");
    window.history.replaceState(null, "", url);
    if (d) requestAnimationFrame(() => document.getElementById("day-detail")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [summary.from]);
  const onSheetOpenChange = useCallback((open: boolean) => !open && setTaskId(null), []);

  const selected = summary.days.find((d) => d.date === day) ?? null;
  const t = summary.totals;
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
          <Button variant="outline" size="icon" nativeButton={false} aria-label="Previous week" render={<Link href={`/work/summary?week=${shift(summary.from, -7)}`} />}>
            <ChevronLeft className="size-4" />
          </Button>
          {summary.from !== thisMonday && (
            <Button variant="outline" nativeButton={false} render={<Link href="/work/summary" />}>
              This week
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Next week"
            nativeButton={false}
            disabled={summary.from >= thisMonday}
            render={<Link href={`/work/summary?week=${shift(summary.from, 7)}`} aria-disabled={summary.from >= thisMonday} />}
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
            onChange={(e) => e.target.value && router.push(`/work/summary?week=${e.target.value}`)}
          />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
          {canEdit && <SettingsDialog settings={settings} />}
        </div>
      </div>

      {isNew && <Welcome side={scope.side} canEdit={canEdit} aiOn={aiAvailable} />}

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
        <Stat label="Finished" value={t.completed} days={summary.days.map((d) => d.completed.length)} />
        <Stat label="Moved forward" value={t.progressed} days={summary.days.map((d) => d.progressed.length)} />
        <Stat label="New tasks" value={t.added} days={summary.days.map((d) => d.added.length)} />
        <Stat label="Comments" value={t.comments} days={summary.days.map((d) => d.comments.length)} />
        <Stat label="Files shared" value={t.files} days={summary.days.map((d) => d.files.length)} />
        {t.hours !== null && (
          <Stat
            label="Hours"
            value={t.hours}
            days={summary.days.map((d) => d.hours ?? 0)}
            mono
            hint={hoursHidden ? "Only your team sees hours" : undefined}
          />
        )}
      </section>

      {/* Days */}
      <section aria-label="Days" data-tour="summary-days" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {summary.days.map((d) => (
          <DayCard key={d.date} d={d} today={today} selected={d.date === day} onSelect={() => pickDay(d.date === day ? null : d.date)} />
        ))}
      </section>

      {selected && (
        <DayDetail
          key={selected.date}
          d={selected}
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

function DayCard({ d, today, selected, onSelect }: { d: DaySummary; today: string; selected: boolean; onSelect: () => void }) {
  const active = isActive(d);
  const future = d.date > today;
  const isToday = d.date === today;
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
          {d.note && <span className="line-clamp-4 text-sm">{d.note.body}</span>}
          {!d.note && d.completed.length > 0 && (
            <ul className="space-y-0.5 text-sm">
              {d.completed.slice(0, 3).map((c) => (
                <li key={c.taskId + c.at.toString()} className="truncate">
                  ✓ {c.title}
                </li>
              ))}
              {d.completed.length > 3 && <li className="text-muted-foreground">+{d.completed.length - 3} more</li>}
            </ul>
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
  canEdit,
  aiAvailable,
  hoursHidden,
  textInfo,
  onOpenTask,
  onClose,
}: {
  d: DaySummary;
  canEdit: boolean;
  aiAvailable: boolean;
  hoursHidden: boolean;
  /** For the team when the evening text is on. */
  textInfo: { isToday: boolean; people: number } | null;
  onOpenTask: (id: string) => void;
  onClose: () => void;
}) {
  const byProject = <T extends { projectName: string }>(items: T[]) => {
    const groups = new Map<string, T[]>();
    for (const i of items) groups.set(i.projectName, [...(groups.get(i.projectName) ?? []), i]);
    return [...groups.entries()];
  };
  return (
    <section id="day-detail" className="scroll-mt-4 space-y-5 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-semibold">{fmt(d.date, { weekday: "long", month: "long", day: "numeric" })}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} data-print-hide>
          Close
        </Button>
      </div>
      <NoteBlock period="DAY" day={d.date} note={d.note} canEdit={canEdit} aiAvailable={aiAvailable && isActive(d)} emptyText={canEdit ? "No note for this day yet." : null} />
      {textInfo && <DayText d={d} {...textInfo} />}
      {!isActive(d) && <p className="text-sm text-muted-foreground">Nothing was updated this day.</p>}

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
      {d.hours !== null && d.hours > 0 && (
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {d.hours}h of work{hoursHidden && " (only your team sees hours)"}
        </p>
      )}
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
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={period === "WEEK" ? 4 : 3} aria-label={period === "WEEK" ? "Week summary" : "Day note"} />
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
        <p className={cn("text-sm whitespace-pre-wrap", textClassName)}>{note.body}</p>
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
