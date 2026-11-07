import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { eodActor } from "@/lib/eod-session";
import { canManageEods, getReport } from "@/lib/eod";
import { toReportData } from "@/lib/eod-view";
import { UserFacingError } from "@/lib/user-facing-error";
import { Button } from "@/components/ui/button";
import { EodReportView } from "@/components/eod/eod-report-view";

// One end-of-day report, for its author or a manager (notifications and the
// team page link here). The author's own draft opens in their editor.
export default async function EodReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await eodActor();
  const report = await getReport(actor, id).catch((error) => {
    if (error instanceof UserFacingError) notFound();
    throw error;
  });
  const day = report.reportDate.toISOString().slice(0, 10);
  const own = report.userId === actor.userId;
  if (own && report.status === "DRAFT") redirect(`/eod?date=${day}`);
  const manager = canManageEods(actor.role);
  const longDate = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={manager ? `/eod/team?date=${day}` : `/eod?date=${day}`} />}>
          <ChevronLeft className="size-4" /> {manager ? "Team" : "My reports"}
        </Button>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">End-of-day report · {report.user.name}</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{longDate}</h1>
        </div>
      </div>
      {report.status === "DRAFT" && <p className="text-sm text-muted-foreground">Still a draft — {report.user.name} hasn&apos;t submitted it yet.</p>}
      <EodReportView report={toReportData(report)} canReopen={manager} showAuthor={!own} />
    </div>
  );
}
