import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { listTimeEntries, listBreakDeductions } from "@/lib/actions/time-entries";
import {
  hoursBetween,
  formatDuration,
  formatMoney,
  summarizeByUser,
  zonedInputToISOString,
  type BreakDeductionRule,
} from "@/lib/time-entries";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;
const ROW_HEIGHT = 16;

function truncate(text: string, maxChars: number) {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const userId = params.get("userId") ?? undefined;
    const fromParam = params.get("from");
    const toParam = params.get("to");
    // The browser passes its (or the viewer's saved Account) timezone
    // explicitly — this route runs in Node, which has no idea which
    // timezone the person downloading the PDF is actually in.
    const timeZone = params.get("tz") || "UTC";
    if (!fromParam || !toParam) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }
    // Resolved against the caller's own `timeZone`, not this route's server
    // process — plain `new Date("yyyy-MM-ddTHH:mm:ss")` parses as *local*
    // time per the JS spec, which silently shifted the displayed range (and
    // the query boundaries) by this server's own UTC offset whenever it
    // didn't match `timeZone`. `to` is the instant just before the next
    // day's midnight in that zone, so the whole of `toParam`'s day is
    // included.
    const from = new Date(zonedInputToISOString(`${fromParam}T00:00`, timeZone));
    const toNextMidnight = new Date(zonedInputToISOString(`${toParam}T00:00`, timeZone));
    const to = new Date(toNextMidnight.getTime() + 24 * 60 * 60 * 1000 - 1);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const [entries, deductions] = await Promise.all([
      listTimeEntries({ userId, from, to }),
      listBreakDeductions({ userId, from, to }),
    ]);
    const rules: BreakDeductionRule[] = deductions.map((d) => ({
      userId: d.userId,
      fromDate: d.fromDate,
      toDate: d.toDate,
      minutesPerDay: d.minutesPerDay,
    }));
    const totals = summarizeByUser(entries, rules, timeZone);
    const entriesByUser = new Map<string, typeof entries>();
    for (const entry of entries) {
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

    page.drawText("Timesheet Report", { x: MARGIN, y, size: 16, font: boldFont });
    y -= 20;
    page.drawText(`${rangeLabel} · Generated ${new Date().toLocaleString(undefined, { timeZone })}`, {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 28;

    if (totals.length === 0) {
      page.drawText("No sessions in this range.", { x: MARGIN, y, size: 10, font });
    }

    for (const total of totals) {
      ensureRoom(4);
      page.drawText(total.userName, { x: MARGIN, y, size: 12, font: boldFont });
      y -= 15;
      const rateLabel = total.hourlyRate != null ? `${formatMoney(total.hourlyRate)}/hr` : "No rate set";
      const openLabel = total.hasOpenEntry ? " · currently on the clock (excluded from totals)" : "";
      page.drawText(`${rateLabel}${openLabel}`, { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
      y -= 16;

      const cols = [
        { label: "Date", width: 80 },
        { label: "Clock in", width: 90 },
        { label: "Clock out", width: 90 },
        { label: "Hours", width: 70 },
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

      for (const entry of entriesByUser.get(total.userId) ?? []) {
        ensureRoom(1);
        const hours = entry.clockOut ? hoursBetween(entry.clockIn, entry.clockOut) : null;
        const row = [
          entry.clockIn.toLocaleDateString(undefined, { timeZone }),
          entry.clockIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone }),
          entry.clockOut
            ? entry.clockOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone })
            : "—",
          hours !== null ? formatDuration(hours) : "in progress",
        ];
        let rx = MARGIN;
        row.forEach((value, i) => {
          const col = cols[i];
          page.drawText(truncate(value, Math.floor(col.width / 5.5)), { x: rx, y, size: 9, font });
          rx += col.width;
        });
        y -= ROW_HEIGHT;
      }

      ensureRoom(1);
      const breakLabel = total.breakHours > 0 ? ` (-${formatDuration(total.breakHours)} break)` : "";
      page.drawText(
        `Subtotal: ${formatDuration(total.hours)}${breakLabel}${total.pay != null ? ` · ${formatMoney(total.pay)}` : ""}`,
        { x: MARGIN, y, size: 9, font: boldFont }
      );
      y -= 26;
    }

    if (totals.length > 0) {
      ensureRoom(2);
      const grandHours = totals.reduce((sum, t) => sum + t.hours, 0);
      const grandPay = totals.reduce((sum, t) => sum + (t.pay ?? 0), 0);
      page.drawLine({
        start: { x: MARGIN, y: y + 10 },
        end: { x: PAGE_SIZE[0] - MARGIN, y: y + 10 },
        thickness: 1,
        color: rgb(0.6, 0.6, 0.6),
      });
      page.drawText(`Grand total: ${formatDuration(grandHours)} · ${formatMoney(grandPay)}`, {
        x: MARGIN,
        y,
        size: 11,
        font: boldFont,
      });
    }

    const bytes = await pdfDoc.save();
    const suffix = userId ? totals[0]?.userName.replace(/\s+/g, "-").toLowerCase() ?? userId : "all-users";

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="timesheet-${suffix}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
