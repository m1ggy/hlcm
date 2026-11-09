"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Link2, Loader2, Plus, Send, Trash2, X } from "lucide-react";
import { saveEodDraftAction, submitEodAction } from "@/lib/actions/eod";
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatusValue } from "@/lib/task-status";
import { WORK_TASK_STATUSES, WORK_TASK_STATUS_LABELS, type WorkTaskStatus } from "@/lib/work";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatMinutes } from "@/lib/eod-format";
import type { EodLine, EodReportData, LinkableCorrespondence, TaskOption, WorkTaskOption } from "./eod-types";

// Today's report while it's a draft (docs/client-portal-eod-plan.md, Phase
// C): a card per line — what you did, the task's new status, minutes, and
// whether the client sees it — then summary, blockers and tomorrow's plan.
// Saves itself a moment after each change; Submit saves first.

type Draft = Omit<EodLine, "id"> & { id?: string; key: string };
const AUTOSAVE_MS = 1200;
let nextKey = 0;
const keyed = (l: EodLine): Draft => ({ ...l, key: l.id });
const workKey = (w: { orgId: string; taskId: string }) => `w:${w.orgId}:${w.taskId}`;

export function EodEditor({
  report,
  tasks,
  workTasks = [],
  linkable = [],
}: {
  report: EodReportData;
  tasks: TaskOption[];
  /** My open tasks in client workspaces (workspace tasks Phase 5). */
  workTasks?: WorkTaskOption[];
  linkable?: LinkableCorrespondence[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Draft[]>(() => report.items.map(keyed));
  const [summary, setSummary] = useState(report.summary ?? "");
  const [blockers, setBlockers] = useState(report.blockers ?? "");
  const [tomorrowPlan, setTomorrowPlan] = useState(report.tomorrowPlan ?? "");
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [adding, setAdding] = useState<string | null>(null);
  const [extraTitle, setExtraTitle] = useState("");
  const [submitting, startSubmit] = useTransition();
  const version = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null);

  const snapshot = useRef({ lines, summary, blockers, tomorrowPlan });
  useEffect(() => {
    snapshot.current = { lines, summary, blockers, tomorrowPlan };
  }, [lines, summary, blockers, tomorrowPlan]);

  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) await saving.current;
    const sentVersion = version.current;
    const s = snapshot.current;
    const run = (async () => {
      setSaveState("saving");
      try {
        const result = await saveEodDraftAction(report.id, {
          summary: s.summary,
          blockers: s.blockers,
          tomorrowPlan: s.tomorrowPlan,
          items: s.lines.map((l) => ({
            id: l.id,
            taskId: l.taskId,
            title: l.title,
            statusAfter: l.statusAfter,
            workDone: l.workDone,
            internalNote: l.internalNote,
            minutes: l.minutes,
            clientVisible: l.clientVisible,
            ...(l.taskId && { correspondenceIds: l.correspondence.map((c) => c.id) }),
            ...(l.work && { workStatusAfter: l.workStatusAfter, ...(!l.id && { work: { orgId: l.work.orgId, taskId: l.work.taskId } }) }),
          })),
        });
        if (!result.ok) {
          toast.error(result.error);
          setSaveState("error");
          return false;
        }
        // New lines get their ids (and client) back, in the order sent.
        const saved = result.data.items;
        setLines((current) =>
          current.map((l) => {
            const i = s.lines.findIndex((x) => x.key === l.key);
            const back = i >= 0 ? saved[i] : undefined;
            if (!back || l.id) return l;
            if (l.work) {
              const wb = back.workStatusBefore as WorkTaskStatus | null;
              return { ...l, id: back.id, workStatusBefore: wb, workStatusAfter: l.workStatusAfter ?? wb };
            }
            const before = back.statusBefore as TaskStatusValue | null;
            return { ...l, id: back.id, clientId: back.clientId, statusBefore: before, statusAfter: l.statusAfter ?? before, clientVisible: l.clientVisible || Boolean(back.clientId) };
          })
        );
        setSaveState(version.current === sentVersion ? "saved" : "dirty");
        return true;
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save your report"));
        setSaveState("error");
        return false;
      }
    })();
    saving.current = run;
    const ok = await run;
    saving.current = null;
    return ok;
  }, [report.id]);

  // Autosave a moment after the last change.
  const changeCount = useRef(0);
  const [changes, setChanges] = useState(0);
  const touch = useCallback(() => {
    version.current++;
    changeCount.current++;
    setChanges(changeCount.current);
    setSaveState("dirty");
  }, []);
  useEffect(() => {
    if (changes === 0) return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [changes, save]);

  function update(key: string, patch: Partial<Draft>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    touch();
  }
  function remove(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
    touch();
  }
  function addTask(taskId: string | null) {
    setAdding(null);
    const work = workTasks.find((w) => workKey(w) === taskId);
    if (work) {
      setLines((current) => [
        ...current,
        {
          key: `new-${nextKey++}`,
          taskId: null,
          title: work.title,
          clientId: null,
          statusBefore: null,
          statusAfter: null,
          workDone: "",
          internalNote: null,
          minutes: null,
          clientVisible: work.clientVisible,
          correspondence: [],
          work: { orgId: work.orgId, taskId: work.taskId, workspaceName: work.workspaceName },
          workStatusBefore: null,
          workStatusAfter: null,
        },
      ]);
      touch();
      return;
    }
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setLines((current) => [
      ...current,
      { key: `new-${nextKey++}`, taskId: task.id, title: task.label, clientId: null, statusBefore: null, statusAfter: null, workDone: "", internalNote: null, minutes: null, clientVisible: false, correspondence: [], work: null, workStatusBefore: null, workStatusAfter: null },
    ]);
    touch();
  }
  function addExtra() {
    const title = extraTitle.trim();
    if (!title) return;
    setLines((current) => [
      ...current,
      { key: `new-${nextKey++}`, taskId: null, title, clientId: null, statusBefore: null, statusAfter: null, workDone: "", internalNote: null, minutes: null, clientVisible: false, correspondence: [], work: null, workStatusBefore: null, workStatusAfter: null },
    ]);
    setExtraTitle("");
    setAdding(null);
    touch();
  }

  function submit() {
    startSubmit(async () => {
      if (!(await save())) return;
      const result = await submitEodAction(report.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Report submitted — have a good evening");
      router.refresh();
    });
  }

  const onReport = useMemo(() => new Set(lines.map((l) => (l.work ? workKey(l.work) : l.taskId)).filter(Boolean)), [lines]);
  const pickable = useMemo(
    () =>
      Object.fromEntries([
        ...tasks.filter((t) => !onReport.has(t.id)).map((t) => [t.id, t.applicationName ? `${t.label} — ${t.applicationName}` : t.label]),
        ...workTasks.filter((w) => !onReport.has(workKey(w))).map((w) => [workKey(w), `${w.title} — ${w.workspaceName} · ${w.projectName}`]),
      ]),
    [tasks, workTasks, onReport]
  );
  const written = lines.filter((l) => l.workDone.trim()).length;
  const totalMinutes = lines.reduce((s, l) => s + (l.workDone.trim() ? l.minutes ?? 0 : 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          Write what you did on each task you worked on. Lines you leave empty are dropped when you submit.
        </p>
        <SaveIndicator state={saveState} />
      </div>

      <ol className="space-y-3">
        {lines.map((l) => (
          <LineCard
            key={l.key}
            line={l}
            linkable={l.taskId ? linkable.filter((c) => c.taskId === l.taskId) : []}
            onChange={(patch) => update(l.key, patch)}
            onRemove={() => remove(l.key)}
          />
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2" data-print-hide>
        {adding === "task" ? (
          <div className="flex w-full max-w-md items-center gap-2">
            <SearchableSelect items={pickable} value={null} onValueChange={addTask} placeholder="Pick a task…" searchPlaceholder="Search your tasks…" emptyText="No other tasks." className="flex-1" />
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </div>
        ) : adding === "extra" ? (
          <form
            className="flex w-full max-w-md items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addExtra();
            }}
          >
            <Input autoFocus value={extraTitle} onChange={(e) => setExtraTitle(e.target.value)} placeholder="e.g. Team meeting, inbox cleanup" aria-label="What was it" />
            <Button type="submit" disabled={!extraTitle.trim()}>
              Add
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <Button variant="outline" onClick={() => setAdding("task")}>
              <Plus className="size-4" /> Add a task
            </Button>
            <Button variant="outline" onClick={() => setAdding("extra")}>
              <Plus className="size-4" /> Work not on a task
            </Button>
          </>
        )}
      </div>

      <section className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-3">
        <Field label="Summary of the day" value={summary} onChange={(v) => (setSummary(v), touch())} placeholder="The day in a sentence or two" />
        <Field label="Blockers" value={blockers} onChange={(v) => (setBlockers(v), touch())} placeholder="Anything stopping you, or waiting on someone" />
        <Field label="Plan for tomorrow" value={tomorrowPlan} onChange={(v) => (setTomorrowPlan(v), touch())} placeholder="What you'll pick up first" />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {written} {written === 1 ? "line" : "lines"} written{totalMinutes ? ` · ${formatMinutes(totalMinutes)}` : ""}
        </p>
        <Button onClick={submit} loading={submitting} disabled={saveState === "saving"}>
          <Send className="size-4" /> Submit report
        </Button>
      </div>
    </div>
  );
}

function LineCard({
  line,
  linkable,
  onChange,
  onRemove,
}: {
  line: Draft;
  linkable: LinkableCorrespondence[];
  onChange: (p: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(line.internalNote));
  const [linking, setLinking] = useState(false);
  const linked = new Set(line.correspondence.map((c) => c.id));
  const choices = Object.fromEntries(
    linkable.filter((c) => !linked.has(c.id)).map((c) => [c.id, `${c.subject} · ${new Date(c.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`])
  );
  const id = `line-${line.key}`;
  const empty = !line.workDone.trim();
  return (
    <li className={cn("rounded-xl border bg-card p-4 transition-colors", empty && "border-dashed bg-card/60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{line.title}</p>
          {line.work ? (
            <p className="text-xs text-muted-foreground">In {line.work.workspaceName}</p>
          ) : (
            !line.taskId && <p className="text-xs text-muted-foreground">Not on a task</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {line.taskId && (
            <Select value={line.statusAfter ?? line.statusBefore ?? "NOT_STARTED"} onValueChange={(v) => onChange({ statusAfter: v as TaskStatusValue })}>
              <SelectTrigger size="sm" className="w-36" aria-label={`Status of ${line.title}`}>
                <SelectValue>{(v: TaskStatusValue) => TASK_STATUS_LABELS[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {line.work && (
            <Select
              value={line.workStatusAfter ?? line.workStatusBefore ?? "TODO"}
              onValueChange={(v) => onChange({ workStatusAfter: v as WorkTaskStatus })}
            >
              <SelectTrigger size="sm" className="w-36" aria-label={`Status of ${line.title}`}>
                <SelectValue>{(v: WorkTaskStatus) => WORK_TASK_STATUS_LABELS[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {WORK_TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {WORK_TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${line.title}`}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor={`${id}-work`} className="sr-only">
            What you did on {line.title}
          </Label>
          <Textarea
            id={`${id}-work`}
            value={line.workDone}
            onChange={(e) => onChange({ workDone: e.target.value })}
            placeholder="What you did"
            rows={2}
          />
        </div>
        <div className="flex items-start gap-2 md:w-28 md:flex-col">
          <Label htmlFor={`${id}-min`} className="text-xs text-muted-foreground md:sr-only">
            Minutes
          </Label>
          <Input
            id={`${id}-min`}
            type="number"
            min={0}
            max={1440}
            inputMode="numeric"
            value={line.minutes ?? ""}
            onChange={(e) => onChange({ minutes: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="Minutes"
            className="w-28"
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {(line.clientId || line.work) && (
          <label className="flex items-center gap-2">
            <Checkbox checked={line.clientVisible} onCheckedChange={(c) => onChange({ clientVisible: Boolean(c) })} />
            Share with the client
          </label>
        )}
        {noteOpen ? (
          <Input
            value={line.internalNote ?? ""}
            onChange={(e) => onChange({ internalNote: e.target.value })}
            placeholder="Internal note (never shared)"
            aria-label={`Internal note on ${line.title}`}
            className="max-w-md"
          />
        ) : (
          <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setNoteOpen(true)}>
            Add an internal note
          </button>
        )}
        {line.taskId &&
          (linking ? (
            <div className="flex w-full max-w-md items-center gap-2">
              <SearchableSelect
                items={choices}
                value={null}
                onValueChange={(id) => {
                  const c = linkable.find((x) => x.id === id);
                  setLinking(false);
                  if (c) onChange({ correspondence: [...line.correspondence, { id: c.id, subject: c.subject, kind: c.kind, occurredAt: c.occurredAt }] });
                }}
                placeholder="Pick an email or call…"
                searchPlaceholder="Search correspondence…"
                emptyText="Nothing from the last 30 days on this task or its application."
                className="flex-1"
              />
              <Button variant="ghost" size="sm" onClick={() => setLinking(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            linkable.length > linked.size && (
              <button type="button" className="flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline" onClick={() => setLinking(true)}>
                <Link2 className="size-3.5" /> Link correspondence
              </button>
            )
          ))}
      </div>
      {line.correspondence.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Correspondence on ${line.title}`}>
          {line.correspondence.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs">
              <Link2 className="size-3 text-muted-foreground" />
              <span className="max-w-64 truncate">{c.subject}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Unlink ${c.subject}`}
                onClick={() => onChange({ correspondence: line.correspondence.filter((x) => x.id !== c.id) })}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  const id = `eod-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} />
    </div>
  );
}

function SaveIndicator({ state }: { state: "saved" | "dirty" | "saving" | "error" }) {
  if (state === "saving" || state === "dirty")
    return (
      <span className="flex items-center gap-1 text-xs">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    );
  if (state === "error") return <span className="text-xs text-destructive">Not saved</span>;
  return (
    <span className="flex items-center gap-1 text-xs">
      <Check className="size-3" /> Saved
    </span>
  );
}
