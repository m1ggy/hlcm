"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bell, MessageSquare, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORK_TASK_STATUS_LABELS, WORK_TASK_STATUSES, type WorkTaskStatus } from "@/lib/work";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusDot, SubtaskProgress } from "@/components/work/work-status";

// The home page's "video": a looping walk-through of a client's workspace,
// made of elements rather than a recording. It uses the app's own pieces
// (status dots, badges, subtask progress) and its real wording, so it shows
// what a client actually gets — keep it in step with src/components/work.
// Made-up data only. With reduced motion on it shows the last frame, still.
//
// The story, one beat per step: the client clicks "Request a task", the
// request waits for approval, the team moves work along and a manager
// accepts it, a comment pops up, then the week's numbers come in.

const STEP_MS = 1800;
const STEPS = 10;
const LAST = STEPS - 1;

type Row = {
  id: string;
  title: string;
  who: string;
  status: WorkTaskStatus;
  done?: number;
  total?: number;
  comments?: number;
  request?: "waiting" | "accepted";
};

const START: Row[] = [
  { id: "newsletter", title: "Draft March newsletter", who: "Jamie Lee", status: "IN_PROGRESS", done: 2, total: 4 },
  { id: "invoices", title: "Reconcile February invoices", who: "Maria Ruiz", status: "TODO", done: 0, total: 3 },
  { id: "venue", title: "Book venue for team day", who: "Alex Kim", status: "BLOCKED", comments: 2 },
  { id: "vendors", title: "Update the vendor list", who: "Maria Ruiz", status: "DONE", done: 3, total: 3 },
];

const REQUEST: Row = { id: "cards", title: "Order new business cards", who: "Alex Kim", status: "TODO", request: "waiting" };

/** What the project looks like at a given step. */
function rowsAt(step: number): Row[] {
  const rows = START.map((r) => ({ ...r }));
  const set = (id: string, patch: Partial<Row>) => Object.assign(rows.find((r) => r.id === id)!, patch);
  if (step >= 3) rows.push({ ...REQUEST });
  if (step >= 4) {
    set("invoices", { status: "IN_PROGRESS", done: 1 });
    set("newsletter", { done: 3 });
  }
  if (step >= 5) {
    set("newsletter", { status: "IN_REVIEW", done: 4, comments: 1 });
    set("cards", { request: "accepted" });
  }
  return rows;
}

const STATS = [
  { label: "Finished", value: 6 },
  { label: "Moved forward", value: 4 },
  { label: "New tasks", value: 2 },
  { label: "Comments", value: 3 },
];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function WorkspaceDemo() {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);
  const step = reduced ? LAST : tick;

  // Only plays while it's on screen.
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || !visible) return;
    const id = setInterval(() => setTick((t) => (t + 1) % STEPS), STEP_MS);
    return () => clearInterval(id);
  }, [reduced, visible]);

  // The pointer glides between real elements, measured, so it lands on them at any width.
  const buttonRef = useRef<HTMLSpanElement>(null);
  const requestRef = useRef<HTMLLIElement>(null);
  const commentToastRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState({ x: 70, y: 70 });
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const target =
      step === 1 || step === 2
        ? buttonRef.current
        : step === 3 || step === 4
          ? requestRef.current
          : step === 5 || step === 6
            ? commentToastRef.current
            : step >= 7
              ? summaryRef.current
              : null;
    if (!target) {
      setPointer({ x: root.clientWidth * 0.55, y: root.clientHeight * 0.45 });
      return;
    }
    const r = root.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    setPointer({ x: t.left - r.left + Math.min(t.width * 0.5, 70), y: t.top - r.top + t.height * 0.6 });
  }, [step]);

  const rows = rowsAt(step);
  const groups = WORK_TASK_STATUSES.map((status) => ({ status, tasks: rows.filter((t) => t.status === status) })).filter((g) => g.tasks.length > 0);
  const clicking = step === 2;
  const unread = step >= 5 ? 1 : 0;
  const animateIn = !reduced && "animate-in fade-in slide-in-from-top-1 duration-500";

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label="Animated example of a client workspace: the client requests a task, the team moves tasks forward and accepts the request, a comment notification pops up and the week's numbers appear."
      className="relative select-none"
    >
      {/* Soft glow behind the window. */}
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/25 via-marigold/15 to-transparent blur-2xl" />

      <div aria-hidden className="overflow-hidden rounded-2xl border bg-background shadow-xl shadow-primary/10">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 min-w-0 flex-1 truncate rounded-md bg-background px-3 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
            yourbusiness.carenela.com/work
          </span>
          <span className="relative">
            <Bell className="size-4 text-muted-foreground" />
            {unread > 0 && (
              <Badge variant="destructive" className="absolute -top-1.5 -right-2 h-4 min-w-4 px-1 text-[0.6rem]">
                {unread}
              </Badge>
            )}
          </span>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm bg-primary" />
              <span className="truncate font-heading font-semibold">Office operations</span>
            </div>
            <span ref={buttonRef} className={cn(buttonVariants({ size: "sm" }), "pointer-events-none transition-transform", clicking && "scale-95")}>
              Request a task
            </span>
          </div>

          <div className="space-y-3">
            {groups.map((g) => (
              <section key={g.status} className="space-y-1">
                <h3 className="flex items-center gap-2 px-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  <StatusDot status={g.status} /> {WORK_TASK_STATUS_LABELS[g.status]} <span className="font-normal tabular-nums">{g.tasks.length}</span>
                </h3>
                <ul className="divide-y rounded-lg border bg-card">
                  {g.tasks.map((t) => (
                    <li key={t.id} ref={t.id === REQUEST.id ? requestRef : undefined} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2", animateIn)}>
                      <span className={cn("min-w-0 flex-1 text-sm", t.status === "DONE" && "text-muted-foreground")}>
                        {t.title}
                        {t.request && (
                          <Badge key={t.request} variant={t.request === "waiting" ? "outline" : "secondary"} className={cn("ml-2 align-middle", !reduced && "animate-in zoom-in-95 fade-in duration-300")}>
                            {t.request === "waiting" ? "Waiting for approval" : "Client request"}
                          </Badge>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        {t.total ? <SubtaskProgress done={t.done ?? 0} total={t.total} /> : null}
                        {t.comments ? (
                          <span className="inline-flex items-center gap-0.5 tabular-nums">
                            <MessageSquare className="size-3" /> {t.comments}
                          </span>
                        ) : null}
                        <AvatarInitials name={t.who} className="size-5 text-[0.6rem] ring-2 ring-card" />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* The weekly summary's numbers, as on /work/summary. */}
          <div ref={summaryRef} className="grid grid-cols-4 gap-2">
            {STATS.map((s, i) => (
              <div key={s.label} className="rounded-lg border bg-card px-2 py-1.5">
                <div className="truncate text-[0.65rem] text-muted-foreground">{s.label}</div>
                <div
                  key={step >= 7 ? "on" : "off"}
                  className={cn("font-heading text-lg font-semibold tabular-nums", step >= 7 && !reduced && "animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-500")}
                  style={step >= 7 && !reduced ? { animationDelay: `${i * 120}ms` } : undefined}
                >
                  {step >= 7 ? s.value : "–"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pop-ups, styled like the app's toasts. */}
      <div aria-hidden className="pointer-events-none absolute right-3 bottom-3 left-3 flex flex-col items-end gap-2 sm:left-auto sm:w-80">
        <DemoToast show={step === 3 || step === 4}>Request sent. A manager will accept it or get back to you.</DemoToast>
        <DemoToast ref={commentToastRef} show={step === 5 || step === 6} action="Open">
          New comment on &ldquo;Draft March newsletter&rdquo;
        </DemoToast>
      </div>

      {/* Pointer */}
      {!reduced && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 transition-transform duration-[900ms] ease-in-out"
          style={{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }}
        >
          <span className={cn("absolute -top-2 -left-2 size-8 rounded-full bg-primary/30 transition-all duration-300", clicking ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
          <MousePointer2 className="relative size-5 fill-foreground text-background drop-shadow" />
        </div>
      )}
    </div>
  );
}

function DemoToast({ show, action, children, ref }: { show: boolean; action?: string; children: React.ReactNode; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-lg transition-all duration-300",
        show ? "translate-y-0 opacity-100" : "absolute translate-y-2 opacity-0"
      )}
    >
      <span className="flex-1">{children}</span>
      {action && <span className="rounded-md bg-primary px-2 py-1 text-[0.65rem] font-medium text-primary-foreground">{action}</span>}
    </div>
  );
}
