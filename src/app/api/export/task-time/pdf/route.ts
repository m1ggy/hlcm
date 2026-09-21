import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { auth } from "@/auth";
import { isManagement } from "@/lib/rbac";
import { listMyTaskTimeEntries, listTeamTaskTimeEntries } from "@/lib/actions/task-time-entries";
import { summarizeByTask, type TaskTimeEntryLite } from "@/lib/task-time-entries";
import { formatDuration, formatMoney, zonedInputToISOString } from "@/lib/time-entries";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;
const ROW_HEIGHT = 16;

function truncate(text: string, maxChars: number) {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

// Self-service for a plain user (their own tracked time only — mirrors the
// "My week"/Report tabs' own self-scope), or ADMIN/MANAGER exporting one
// teammate or everyone — same split as the rest of task-time-entries.ts,
// just resolved here instead of inside a single shared action, since the
// choice of which action to call depends on the requester's own role.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const params = request.nextUrl.searchParams;
    const requestedUserId = params.get("userId") ?? undefined;
    const fromParam = params.get("from");
    const toParam = params.get("to");
    const timeZone = params.get("tz") || "UTC";
    if (!fromParam || !toParam) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }

    const from = new Date(zonedInputToISOString(`${fromParam}T00:00`, timeZone));
    const toNextMidnight = new Date(zonedInputToISOString(`${toParam}T00:00`, timeZone));
    const to = new Date(toNextMidnight.getTime() + 24 * 60 * 60 * 1000 - 1);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const management = isManagement(session.user.role);
    const entries = management
      ? await listTeamTaskTimeEntries({ userId: requestedUserId, from, to })
      : await listMyTaskTimeEntries({ from, to }); // requestedUserId ignored — self only

    const entriesByUser = new Map<string, TaskTimeEntryLite[]>();
    for (const entry of entries as unknown as TaskTimeEntryLite[]) {
      const list = entriesByUser.get(entry.userId) ?? [];
      list.push(entry);
      entriesByUser.set(entry.userId, list);
    }

    const rangeLabel = `${from.toLocaleDateString(undefined, { timeZone })} – ${to.toLocaleDateString(undefined, { timeZone })}`;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage(PAGE_SIZE);
    let y = PAGE_SIZE[1] - MARGIN;

    function newPage() {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }

    function ensureRoom(rows: number) {
      if (y - rows * ROW_HEIGHT < MARGIN) newPage();
    }

    page.drawText("Task Time Report", { x: MARGIN, y, size: 16, font: boldFont });
    y -= 20;
    page.drawText(`${rangeLabel} · Generated ${new Date().toLocaleString(undefined, { timeZone })}`, {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 28;

    if (entriesByUser.size === 0) {
      page.drawText("No time logged in this range.", { x: MARGIN, y, size: 10, font });
    }

    let grandHours = 0;
    let grandBillable = 0;

    for (const [, userEntries] of entriesByUser) {
      const userName = userEntries[0]?.user.name ?? "Unknown";
      const taskRows = summarizeByTask(userEntries);
      const userHours = taskRows.reduce((s, r) => s + r.hours, 0);
      const userBillable = taskRows.reduce((s, r) => s + r.billableAmount, 0);
      grandHours += userHours;
      grandBillable += userBillable;

      ensureRoom(4);
      page.drawText(userName, { x: MARGIN, y, size: 12, font: boldFont });
      y -= 18;

      const cols = [
        { label: "Task", width: 220 },
        { label: "Application", width: 160 },
        { label: "Hours", width: 70 },
        { label: "Billable", width: 70 },
      ];
      let x = MARGIN;
      for (const col of cols) {
        page.drawText(col.label, { x, y, size: 9, font: boldFont });
        x += col.width;
      }
      y -= 5;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: MARGIN + cols.reduce((s, c) => s + c.width, 0), y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= ROW_HEIGHT;

      for (const row of taskRows) {
        ensureRoom(1);
        const values = [
          row.taskLabel,
          row.applicationName ?? "—",
          formatDuration(row.hours),
          row.billableAmount > 0 ? formatMoney(row.billableAmount) : "—",
        ];
        let rx = MARGIN;
        values.forEach((value, i) => {
          const col = cols[i];
          page.drawText(truncate(value, Math.floor(col.width / 5.5)), { x: rx, y, size: 9, font });
          rx += col.width;
        });
        y -= ROW_HEIGHT;
      }

      ensureRoom(1);
      page.drawText(
        `Subtotal: ${formatDuration(userHours)}${userBillable > 0 ? ` · ${formatMoney(userBillable)}` : ""}`,
        { x: MARGIN, y, size: 9, font: boldFont }
      );
      y -= 26;
    }

    if (entriesByUser.size > 0) {
      ensureRoom(2);
      page.drawLine({
        start: { x: MARGIN, y: y + 10 },
        end: { x: PAGE_SIZE[0] - MARGIN, y: y + 10 },
        thickness: 1,
        color: rgb(0.6, 0.6, 0.6),
      });
      page.drawText(
        `Grand total: ${formatDuration(grandHours)}${grandBillable > 0 ? ` · ${formatMoney(grandBillable)}` : ""}`,
        { x: MARGIN, y, size: 11, font: boldFont }
      );
    }

    const bytes = await pdfDoc.save();
    const firstUserName = entriesByUser.size > 0 ? [...entriesByUser.values()][0][0]?.user.name : undefined;
    const suffix = requestedUserId && management && firstUserName ? firstUserName.replace(/\s+/g, "-").toLowerCase() : "all";

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="task-time-${suffix}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
