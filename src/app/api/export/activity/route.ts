import { NextResponse } from "next/server";
import { getActivityReport } from "@/lib/activity-data";
import { exportResponse, parseExportFormat, type ExportCell, type ExportDoc } from "@/lib/report-export";
import { ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { auth } from "@/auth";

const hours = (sec: number) => Math.round((sec / 3600) * 100) / 100;
const pct = (value: number | null): ExportCell => value;

// Admin > Activity download: ?from=yyyy-MM-dd&to=yyyy-MM-dd&format=csv|xlsx|pdf.
// OWNER/DEVELOPER only (checked in getActivityReport); audited, since it
// lists window-title-derived app usage for everyone.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const format = parseExportFormat(params.get("format") ?? "csv");
    if (!format) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
    const report = await getActivityReport(params.get("from") ?? "", params.get("to") ?? "");
    const session = await auth();
    if (session?.user) {
      await recordAudit({ entityType: "ActivityReport", entityId: `${report.from}..${report.to}`, action: "export", actorId: session.user.id, newValue: format });
    }

    const doc: ExportDoc = {
      title: "Desktop app activity",
      subtitle: `${report.from} to ${report.to} (${report.timeZone}). Activity = time with keyboard/mouse input; adjusted adds app-rule credit. Percentages of tracked time.`,
      sections: [
        {
          title: "By person",
          columns: [
            { label: "Person" },
            { label: "Role" },
            { label: "Worked (h)", kind: "number" },
            { label: "Tracked by app (h)", kind: "number" },
            { label: "Productive %", kind: "number" },
            { label: "Unproductive %", kind: "number" },
            { label: "Top apps" },
          ],
          rows: report.people.map((p) => [
            p.name,
            p.role,
            hours(p.workedSec),
            hours(p.score.trackedSec),
            pct(p.score.productivityPct),
            pct(p.score.unproductivePct),
            p.topApps.join(", "),
          ]),
        },
        {
          title: "By day",
          columns: [
            { label: "Person" },
            { label: "Date" },
            { label: "Worked (h)", kind: "number" },
            { label: "Tracked by app (h)", kind: "number" },
            { label: "Productive %", kind: "number" },
          ],
          rows: report.people.flatMap((p) =>
            p.days.map((d) => [p.name, d.date, hours(d.workedSec), hours(d.score.trackedSec), pct(d.score.productivityPct)])
          ),
        },
      ],
    };
    return exportResponse(doc, format, `activity-${report.from}-to-${report.to}`);
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message === "Not permitted" ? "Forbidden" : error.message }, { status: 403 });
    throw error;
  }
}
