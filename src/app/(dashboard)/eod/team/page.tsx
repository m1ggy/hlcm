import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, MessageSquare } from "lucide-react";
import { currentOrganization } from "@/lib/db";
import { eodActor } from "@/lib/eod-session";
import { canManageEods, eodToday, teamDay, type TeamRow } from "@/lib/eod";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateJump } from "@/components/eod/eod-controls";
import { RequiredToggle } from "@/components/eod/required-toggle";
import { formatMinutes } from "@/lib/eod-format";

// Everyone's end-of-day report for a day (docs/client-portal-eod-plan.md,
// Phase C): managers see who submitted, who's still drafting and who's
// missing, open any report to read and comment, and export.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (day: string) => shift(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const STATE: Record<TeamRow["state"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  SUBMITTED: { label: "Submitted", variant: "default" },
  DRAFT: { label: "Drafting", variant: "secondary" },
  MISSING: { label: "Missing", variant: "destructive" },
  NOT_EXPECTED: { label: "Not expected", variant: "outline" },
};
const ORDER: TeamRow["state"][] = ["MISSING", "DRAFT", "SUBMITTED", "NOT_EXPECTED"];

export default async function EodTeamPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const org = await currentOrganization();
  if (org.kind === "TASKS") redirect("/work");
  const actor = await eodActor();
  if (!canManageEods(actor.role)) redirect("/eod");

  const today = eodToday(org.timezone || actor.timeZone);
  const { date } = await searchParams;
  const day = date && DAY.test(date) && !Number.isNaN(Date.parse(date)) && date <= today ? date : today;
  const rows = (await teamDay(day)).sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || a.name.localeCompare(b.name));
  const count = (s: TeamRow["state"]) => rows.filter((r) => r.state === s).length;
  const isToday = day === today;
  const longDate = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const monday = mondayOf(day);
  // Submit times in the workspace's timezone, named in the column header.
  const zone = org.timezone || actor.timeZone;
  const zoneShort = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? zone;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Team end-of-day reports</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{longDate}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {count("SUBMITTED")} submitted · {count("DRAFT")} drafting · {count("MISSING")} missing
            {isToday && count("MISSING") + count("DRAFT") > 0 ? " — reminders go out at 6 pm" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous day" nativeButton={false} render={<Link href={`/eod/team?date=${shift(day, -1)}`} />}>
            <ChevronLeft className="size-4" />
          </Button>
          {!isToday && (
            <Button variant="outline" nativeButton={false} render={<Link href="/eod/team" />}>
              Today
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Next day"
            nativeButton={false}
            render={<Link href={`/eod/team?date=${shift(day, 1)}`} aria-disabled={isToday} />}
            className={cn(isToday && "pointer-events-none opacity-50")}
          >
            <ChevronRight className="size-4" />
          </Button>
          <DateJump value={day} max={today} basePath="/eod/team" />
          <Button variant="outline" nativeButton={false} render={<a href={`/api/export/eod?from=${day}&format=xlsx`} />}>
            <Download className="size-4" /> Day
          </Button>
          <Button variant="outline" nativeButton={false} render={<a href={`/api/export/eod?from=${monday}&to=${shift(monday, 6)}&format=xlsx`} />}>
            <Download className="size-4" /> Week
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Report</TableHead>
              <TableHead className="text-right">Lines</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead title={zone}>Submitted ({zoneShort})</TableHead>
              <TableHead>Expected daily</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="font-medium">
                  {r.report ? (
                    <Link href={`/eod/r/${r.report.id}`} className="underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Badge variant={STATE[r.state].variant}>{STATE[r.state].label}</Badge>
                    {r.report && r.report.comments > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground" aria-label={`${r.report.comments} comments`}>
                        <MessageSquare className="size-3" /> {r.report.comments}
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.report?.lines ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.report?.minutes ? formatMinutes(r.report.minutes) : "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.report?.submittedAt ? r.report.submittedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone }) : "—"}
                </TableCell>
                <TableCell>
                  <RequiredToggle userId={r.userId} required={r.required} name={r.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
