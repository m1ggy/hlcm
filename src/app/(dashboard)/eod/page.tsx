import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageSquare, Users } from "lucide-react";
import { currentOrganization } from "@/lib/db";
import { eodActor } from "@/lib/eod-session";
import { canManageEods, canWriteEod, eodToday, getReportFor, listMyReports } from "@/lib/eod";
import { toReportData } from "@/lib/eod-view";
import { listMyTaskOptions } from "@/lib/actions/tasks";
import { listLinkableCorrespondence } from "@/lib/correspondence";
import { workTaskOptions } from "@/lib/work-everywhere";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EodEditor } from "@/components/eod/eod-editor";
import { EodReportView } from "@/components/eod/eod-report-view";
import { StartDayButton, DateJump } from "@/components/eod/eod-controls";

// My end-of-day report (docs/client-portal-eod-plan.md, Phase C): today's,
// or any earlier day's with ?date=.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function EodPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const org = await currentOrganization();
  if (org.kind === "TASKS") redirect("/work");
  const actor = await eodActor();
  if (!canWriteEod(actor.role)) redirect("/");

  const today = eodToday(actor.timeZone);
  const { date } = await searchParams;
  const day = date && DAY.test(date) && !Number.isNaN(Date.parse(date)) && date <= today ? date : today;
  const [report, tasks, history] = await Promise.all([getReportFor(actor.userId, day), listMyTaskOptions(), listMyReports(actor.userId, 14)]);
  const isToday = day === today;
  const manager = canManageEods(actor.role);

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_16rem]">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">End-of-day report{isToday ? " · Today" : ""}</p>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{longDate(day)}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous day" nativeButton={false} render={<Link href={`/eod?date=${shift(day, -1)}`} />}>
              <ChevronLeft className="size-4" />
            </Button>
            {!isToday && (
              <Button variant="outline" nativeButton={false} render={<Link href="/eod" />}>
                Today
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="Next day"
              nativeButton={false}
              render={<Link href={`/eod?date=${shift(day, 1)}`} aria-disabled={isToday} />}
              className={cn(isToday && "pointer-events-none opacity-50")}
            >
              <ChevronRight className="size-4" />
            </Button>
            <DateJump value={day} max={today} />
            {manager && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/eod/team?date=${day}`} />}>
                <Users className="size-4" /> Team
              </Button>
            )}
          </div>
        </div>

        {!report ? (
          isToday ? (
            <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
              <h2 className="font-heading text-lg font-semibold">Start your day</h2>
              <p className="max-w-xl text-sm text-muted-foreground">
                Starts today&apos;s report with your open tasks and anything you&apos;ve timed today. Jot down what you did as you go, then submit it
                before you clock out.
              </p>
              <StartDayButton />
            </section>
          ) : (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No report for this day.</p>
          )
        ) : report.status === "DRAFT" ? (
          <EodEditor
            key={report.id}
            report={toReportData(report)}
            tasks={tasks}
            workTasks={await workTaskOptions(actor.userId)}
            linkable={await listLinkableCorrespondence(
              actor,
              [...new Set([...report.items.map((i) => i.taskId), ...tasks.map((t) => t.id)].filter((id): id is string => Boolean(id)))]
            )}
          />
        ) : (
          <EodReportView report={toReportData(report)} canReopen={isToday || manager} showAuthor={false} />
        )}
      </div>

      <aside className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent reports</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {history.map((h) => {
              const d = h.reportDate.toISOString().slice(0, 10);
              return (
                <li key={h.id}>
                  <Link
                    href={`/eod?date=${d}`}
                    className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted", d === day && "bg-muted font-medium")}
                  >
                    <span>{shortDate(h.reportDate)}</span>
                    <span className="flex items-center gap-1.5">
                      {h._count.comments > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground" aria-label={`${h._count.comments} comments`}>
                          <MessageSquare className="size-3" /> {h._count.comments}
                        </span>
                      )}
                      {h.status === "SUBMITTED" ? <Badge variant="secondary">Sent</Badge> : <Badge variant="outline">Draft</Badge>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
