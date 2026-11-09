import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Circle, CircleDot, FileText, Hourglass } from "lucide-react";
import { getHostOrg } from "@/lib/tenant";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { openShareLink, sharePageData, type SharedDayEntry, type SharePageData } from "@/lib/share-links";
import { DEFAULT_TIMEZONE, toDateInputValue } from "@/lib/time-entries";
import { addDays } from "@/lib/work-summary";
import { TASK_STATUS_LABELS, TASK_CLOSED_STATUSES } from "@/lib/task-status";
import { PRODUCT_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

// An application's share link (docs/client-portal-eod-plan.md, Phase D): a
// read-only progress page anyone with the link can open — no login (see
// isPublicPath in src/auth.config.ts). Unknown, revoked and expired links
// all get the same "no longer active" page. Everything shown comes from
// sharePageData, which picks the fields one by one.

export const metadata: Metadata = {
  title: "Application progress",
  // Never indexed, and the token never leaks to other sites through Referer.
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

// Per visitor IP; generous for a person, tight for anyone guessing tokens.
const isRateLimited = createRateLimiter({ windowMs: 60_000, max: 30 });
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (d: Date, timeZone: string) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
const KIND: Record<string, string> = { EMAIL: "Email", SCREENSHOT: "Screenshot", LETTER: "Letter", PHONE_CALL: "Phone call", PORTAL_MESSAGE: "Portal message", OTHER: "Note" };

export default async function SharePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ week?: string }> }) {
  const org = await getHostOrg();
  const ip = await getClientIp();
  if (!org || org.status !== "ACTIVE") return <Inactive brand={PRODUCT_NAME} />;
  if (ip && isRateLimited(ip)) return <Inactive brand={org.name} message="Too many requests from your connection. Please wait a minute and try again." />;

  const { token } = await params;
  const link = await openShareLink(token, ip);
  if (!link) return <Inactive brand={org.name} />;

  const timeZone = org.timezone || DEFAULT_TIMEZONE;
  const today = toDateInputValue(new Date(), timeZone);
  const { week } = await searchParams;
  const day = week && DAY.test(week) && !Number.isNaN(Date.parse(week)) && week <= today ? week : today;
  const data = await sharePageData(link.applicationId, { day, timeZone });
  const base = `/share/a/${token}`;
  const isThisWeek = addDays(data.week.monday, 6) >= today;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <p className="font-heading text-lg font-semibold tracking-tight">{org.name}</p>
          <p className="text-xs text-muted-foreground">Read-only progress page</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <section className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{data.clientName}</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{data.applicationName}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {data.licenseType && <span>{data.licenseType}</span>}
            {data.stage && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: data.stage.hex }}>
                {data.stage.name}
              </span>
            )}
            <span>Last updated {shortDate(data.updatedAt, timeZone)}</span>
          </div>
        </section>

        {data.waitingOnClient && (
          <section className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <Hourglass className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="font-semibold">We&apos;re waiting on you</h2>
              <p className="text-sm">This application is waiting for documents or information from you. Your contact at {org.name} will tell you exactly what&apos;s needed — reply to their last email or give them a call.</p>
            </div>
          </section>
        )}

        <Progress data={data} timeZone={timeZone} />

        <section className="rounded-xl border bg-background p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">What we did</h2>
            <nav className="flex items-center gap-1 text-sm" aria-label="Week">
              <Link href={`${base}?week=${addDays(data.week.monday, -7)}`} className="rounded-md p-1.5 hover:bg-muted" aria-label="Previous week">
                <ChevronLeft className="size-4" />
              </Link>
              <span className="tabular-nums">Week of {new Date(`${data.week.monday}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span>
              {isThisWeek ? (
                <span className="p-1.5 opacity-30" aria-hidden>
                  <ChevronRight className="size-4" />
                </span>
              ) : (
                <Link href={`${base}?week=${addDays(data.week.monday, 7)}`} className="rounded-md p-1.5 hover:bg-muted" aria-label="Next week">
                  <ChevronRight className="size-4" />
                </Link>
              )}
            </nav>
          </div>
          <Week days={data.week.days.filter((d) => d.date <= today)} timeZone={timeZone} />
        </section>

        <Checklist data={data} />
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-xs text-muted-foreground">
        Shared by {org.name}. Only people with this link can see this page. Powered by {PRODUCT_NAME}.
      </footer>
    </div>
  );
}

function Progress({ data, timeZone }: { data: SharePageData; timeZone: string }) {
  if (data.stages.length === 0 && data.history.length === 0) return null;
  return (
    <section className="space-y-4 rounded-xl border bg-background p-5">
      <h2 className="font-heading text-lg font-semibold">Where it stands</h2>
      {data.stages.length > 0 && (
        <ol className="flex flex-wrap gap-2" aria-label="Stages">
          {data.stages.map((s) => (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs",
                s.state === "done" && "border-transparent bg-muted text-muted-foreground",
                s.state === "current" && "border-transparent font-semibold text-white",
                s.state === "upcoming" && "text-muted-foreground"
              )}
              style={s.state === "current" ? { backgroundColor: s.hex } : undefined}
              aria-current={s.state === "current" ? "step" : undefined}
            >
              {s.state === "done" ? <Check className="size-3" /> : s.state === "current" ? <CircleDot className="size-3" /> : <Circle className="size-3" />}
              {s.name}
            </li>
          ))}
        </ol>
      )}
      {data.stage?.exit && <p className="text-sm">This application is now <strong>{data.stage.name}</strong>.</p>}
      {data.history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Stage history</summary>
          <ol className="mt-2 space-y-1">
            {data.history.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ backgroundColor: h.hex }} />
                <span className="w-28 shrink-0 text-muted-foreground tabular-nums">{shortDate(h.at, timeZone)}</span>
                {h.stage}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function Week({ days, timeZone }: { days: { date: string; entries: SharedDayEntry[] }[]; timeZone: string }) {
  const busy = days.filter((d) => d.entries.length > 0).reverse();
  if (busy.length === 0) return <p className="text-sm text-muted-foreground">No updates shared this week.</p>;
  return (
    <ol className="space-y-5">
      {busy.map((d) => (
        <li key={d.date}>
          <h3 className="mb-2 text-sm font-semibold">{longDay(d.date)}</h3>
          <ul className="space-y-2">
            {d.entries.map((e, i) =>
              e.type === "work" ? (
                <li key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <p className="font-medium">
                    {e.title}
                    {e.status && <span className="ml-2 text-xs font-normal text-muted-foreground">{TASK_STATUS_LABELS[e.status]}</span>}
                  </p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{e.text}</p>
                </li>
              ) : (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  {e.direction === "OUTBOUND" ? <ArrowUpRight className="mt-0.5 size-4 shrink-0" /> : e.direction === "INBOUND" ? <ArrowDownLeft className="mt-0.5 size-4 shrink-0" /> : <FileText className="mt-0.5 size-4 shrink-0" />}
                  <p>
                    <span className="text-muted-foreground">
                      {KIND[e.kind] ?? "Note"} {e.direction === "OUTBOUND" ? "sent" : e.direction === "INBOUND" ? "received" : ""} ·{" "}
                      {e.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })}:
                    </span>{" "}
                    {e.subject}
                  </p>
                </li>
              )
            )}
          </ul>
        </li>
      ))}
    </ol>
  );
}

const closed = (s: string) => (TASK_CLOSED_STATUSES as readonly string[]).includes(s);

function Checklist({ data }: { data: SharePageData }) {
  if (data.phases.length === 0) return null;
  const pct = data.progress.total ? Math.round((data.progress.done / data.progress.total) * 100) : 0;
  return (
    <section className="space-y-4 rounded-xl border bg-background p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Checklist</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {data.progress.done} of {data.progress.total} done
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {data.phases.map((p) => (
        <div key={p.name || "tasks"}>
          {p.name && <h3 className="mb-1 text-sm font-semibold">{p.name}</h3>}
          <ul className="divide-y rounded-lg border">
            {p.tasks.map((t, i) => (
              <li key={i} className="px-3 py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className={cn("flex items-start gap-2", closed(t.status) && "text-muted-foreground")}>
                    {closed(t.status) ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                    {t.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {TASK_STATUS_LABELS[t.status]}
                    {t.dueDate && !closed(t.status) ? ` · due ${t.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""}
                  </span>
                </div>
                {t.subtasks.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-6 text-xs text-muted-foreground">
                    {t.subtasks.map((s, j) => (
                      <li key={j} className="flex items-center gap-1.5">
                        {closed(s.status) ? <Check className="size-3" /> : <Circle className="size-3" />} {s.title}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Inactive({ brand, message }: { brand: string; message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="max-w-sm space-y-2 rounded-xl border bg-background p-6 text-center">
        <p className="font-heading text-lg font-semibold">{brand}</p>
        <p className="text-sm text-muted-foreground">{message ?? "This link is no longer active. Ask your contact for a new one."}</p>
      </div>
    </div>
  );
}
