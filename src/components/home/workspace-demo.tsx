"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, MessageSquare, MousePointer2, Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORK_TASK_STATUS_LABELS, type WorkTaskStatus } from "@/lib/work";

// The home page's "video": a looping walk-through of a client's workspace,
// made of ordinary elements rather than a recording, so it stays sharp, follows
// the theme and weighs nothing. Made-up data only. With reduced motion turned
// on it shows the last frame and stays still.
//
// The story, one beat per step: the client opens their board, clicks
// "Request a task", the request lands, the team moves work along and leaves a
// comment, then the weekly summary writes itself. Then it starts over.

const STEP_MS = 1700;
const STEPS = 10;
const LAST = STEPS - 1;

type Row = { id: string; title: string; who: string; status: WorkTaskStatus; progress: number };

const START: Row[] = [
  { id: "vendors", title: "Update the vendor list", who: "MR", status: "DONE", progress: 100 },
  { id: "newsletter", title: "Draft March newsletter", who: "JL", status: "IN_PROGRESS", progress: 60 },
  { id: "invoices", title: "Reconcile February invoices", who: "MR", status: "TODO", progress: 0 },
  { id: "venue", title: "Book venue for team day", who: "AK", status: "BLOCKED", progress: 20 },
];

const REQUEST: Row = { id: "cards", title: "Order new business cards", who: "AK", status: "TODO", progress: 0 };

const SUMMARY =
  "6 tasks done this week. The March newsletter is ready for your review, invoices are being reconciled and your business cards are next.";

/** What the board looks like at a given step. */
function rowsAt(step: number): Row[] {
  const rows = START.map((r) => ({ ...r }));
  const set = (id: string, patch: Partial<Row>) => Object.assign(rows.find((r) => r.id === id)!, patch);
  if (step >= 3) rows.push({ ...REQUEST });
  if (step >= 4) set("invoices", { status: "IN_PROGRESS", progress: 45 });
  if (step >= 5) set("newsletter", { status: "IN_REVIEW", progress: 100 });
  if (step >= 6) set("cards", { who: "AK", status: "IN_PROGRESS", progress: 25 });
  return rows;
}

const STATUS_STYLE: Record<WorkTaskStatus, { dot: string; badge: string }> = {
  TODO: { dot: "bg-muted-foreground/50", badge: "bg-muted text-muted-foreground" },
  IN_PROGRESS: { dot: "bg-primary", badge: "bg-primary/10 text-primary" },
  IN_REVIEW: { dot: "bg-violet-500", badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  BLOCKED: { dot: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
  DONE: { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  CANCELLED: { dot: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground" },
};

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

  // The pointer glides between real elements, measured, so it lands on them
  // at any width.
  const buttonRef = useRef<HTMLSpanElement>(null);
  const newRowRef = useRef<HTMLLIElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState({ x: 70, y: 70 });
  useLayoutEffect(() => {
    const root = rootRef.current;
    const target =
      step === 1 || step === 2 ? buttonRef.current : step === 3 || step === 4 ? newRowRef.current : step >= 7 ? summaryRef.current : null;
    if (!root) return;
    if (!target) {
      setPointer({ x: root.clientWidth * 0.55, y: root.clientHeight * 0.45 });
      return;
    }
    const r = root.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    setPointer({ x: t.left - r.left + Math.min(t.width * 0.5, 60), y: t.top - r.top + t.height * 0.6 });
  }, [step]);

  const rows = rowsAt(step);
  const openCount = rows.filter((r) => r.status !== "DONE" && r.status !== "CANCELLED").length;
  const clicking = step === 2;

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label="Animated example of a client workspace: a task request is sent, tasks move from to do to in review, a comment arrives and a weekly summary appears."
      className="relative select-none"
    >
      {/* Soft glow behind the window. */}
      <div aria-hidden className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/25 via-marigold/15 to-transparent blur-2xl" />

      <div aria-hidden className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-primary/10">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 truncate rounded-md bg-background px-3 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
            yourbusiness.carenela.com/work
          </span>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm bg-primary" />
              <span className="truncate font-heading font-semibold">Office operations</span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{openCount} open</span>
            </div>
            <span
              ref={buttonRef}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-200",
                step >= 1 && step <= 2 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
                clicking && "scale-95"
              )}
            >
              <Plus className="size-3.5" />
              Request a task
            </span>
          </div>

          <ul className="mt-4 divide-y">
            {rows.map((t) => {
              const isNew = t.id === REQUEST.id;
              const style = STATUS_STYLE[t.status];
              return (
                <li
                  key={t.id}
                  ref={isNew ? newRowRef : undefined}
                  className={cn(
                    "relative py-2.5",
                    isNew && !reduced && "animate-in fade-in slide-in-from-top-2 duration-500",
                    isNew && step <= 4 && "-mx-2 rounded-md bg-marigold-tint/70 px-2"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full transition-colors duration-500",
                        t.status === "DONE" ? "bg-emerald-500 text-white" : style.dot
                      )}
                    >
                      {t.status === "DONE" && <Check className="size-2.5" strokeWidth={3} />}
                    </span>
                    <span className={cn("flex-1 truncate text-sm transition-colors", t.status === "DONE" && "text-muted-foreground line-through")}>
                      {t.title}
                    </span>
                    {isNew && step <= 4 && (
                      <span className="hidden rounded-full bg-marigold px-2 py-0.5 text-[0.65rem] font-semibold text-on-marigold sm:inline">
                        New request
                      </span>
                    )}
                    <span
                      key={t.status}
                      className={cn(
                        "hidden rounded-full px-2 py-0.5 text-xs transition-colors duration-500 sm:inline",
                        style.badge,
                        !reduced && "animate-in zoom-in-90 fade-in duration-300"
                      )}
                    >
                      {WORK_TASK_STATUS_LABELS[t.status]}
                    </span>
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[0.6rem]">
                      {t.who}
                    </span>
                  </div>
                  <div className="ml-7 mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-[width] duration-700 ease-out", t.status === "DONE" ? "bg-emerald-500" : "bg-primary/70")}
                      style={{ width: `${t.progress}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div
            ref={summaryRef}
            className={cn(
              "mt-4 min-h-[5.5rem] rounded-lg p-3 text-sm transition-colors duration-500",
              step >= 7 ? "bg-marigold-tint text-marigold-ink" : "bg-muted/50 text-muted-foreground"
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <Sparkles className="size-3.5" />
              This week
            </div>
            {/* Writes itself word by word once its step comes up (CSS delays, no timers). */}
            <p className="mt-1">
              {step >= 7
                ? SUMMARY.split(" ").map((word, i) => (
                    <span
                      key={i}
                      className={cn(!reduced && "animate-in fade-in fill-mode-backwards duration-300")}
                      style={reduced ? undefined : { animationDelay: `${i * 70}ms` }}
                    >
                      {word}{" "}
                    </span>
                  ))
                : "Your summary will appear here."}
            </p>
          </div>
        </div>
      </div>

      {/* A comment from the team pops up over the window. */}
      <div
        aria-hidden
        className={cn(
          "absolute -right-2 top-1/3 w-56 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg transition-all duration-500 sm:-right-6",
          step >= 5 && step <= 7 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="flex size-5 items-center justify-center rounded-full bg-secondary font-mono text-[0.55rem]">JL</span>
          <span className="font-semibold">Jamie</span>
          <MessageSquare className="ml-auto size-3.5 text-muted-foreground" />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">The newsletter draft is ready for you to look over.</p>
      </div>

      {/* Toast when the request is sent. */}
      <div
        aria-hidden
        className={cn(
          "absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs text-background shadow-lg transition-all duration-300",
          step === 3 ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        <Check className="size-3.5" /> Request sent to your team
      </div>

      {/* Pointer */}
      {!reduced && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 transition-transform duration-[900ms] ease-in-out"
          style={{ transform: `translate(${pointer.x}px, ${pointer.y}px)` }}
        >
          <span
            className={cn(
              "absolute -left-2 -top-2 size-8 rounded-full bg-primary/30 transition-all duration-300",
              clicking ? "scale-100 opacity-100" : "scale-50 opacity-0"
            )}
          />
          <MousePointer2 className="relative size-5 fill-foreground text-background drop-shadow" />
        </div>
      )}
    </div>
  );
}
