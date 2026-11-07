import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eodActor } from "@/lib/eod-session";
import { canManageEods, linesForExport } from "@/lib/eod";
import { exportResponse, parseExportFormat } from "@/lib/report-export";
import { TASK_STATUS_LABELS, type TaskStatusValue } from "@/lib/task-status";
import { UnauthorizedError } from "@/lib/rbac";
import { UserFacingError } from "@/lib/user-facing-error";

// Submitted end-of-day reports, one row per line, ?from=YYYY-MM-DD&to=…&format=csv|xlsx|pdf.
// Managers only (docs/client-portal-eod-plan.md, Phase C).
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const format = parseExportFormat(params.get("format"));
    const from = params.get("from") ?? "";
    const to = params.get("to") ?? from;
    if (!format || !DAY.test(from) || !DAY.test(to) || from > to) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const actor = await eodActor();
    if (!canManageEods(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const lines = await linesForExport(from, to);
    const clientIds = [...new Set(lines.map((l) => l.clientId).filter((id): id is string => Boolean(id)))];
    const clients = new Map((await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
    const status = (s: string | null) => (s ? TASK_STATUS_LABELS[s as TaskStatusValue] ?? s : "");

    return exportResponse(
      {
        title: "End-of-day reports",
        subtitle: from === to ? from : `${from} to ${to}`,
        sections: [
          {
            title: "Lines",
            columns: [
              { label: "Date", kind: "date", width: 12 },
              { label: "Person", width: 20 },
              { label: "Task / work", width: 32 },
              { label: "Client", width: 20 },
              { label: "Status", width: 14 },
              { label: "Work done", width: 60 },
              { label: "Minutes", kind: "number", width: 10 },
              { label: "Shared with client", width: 10 },
            ],
            rows: lines.map((l) => [
              l.report.reportDate,
              l.report.user.name,
              l.title,
              l.clientId ? clients.get(l.clientId) ?? "" : "",
              l.statusAfter && l.statusAfter !== l.statusBefore ? `${status(l.statusBefore)} → ${status(l.statusAfter)}` : status(l.statusAfter),
              l.workDone,
              l.minutes,
              l.clientVisible ? "Yes" : "No",
            ]),
          },
        ],
      },
      format,
      `eod-${from}${from === to ? "" : `-to-${to}`}`
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof UserFacingError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
