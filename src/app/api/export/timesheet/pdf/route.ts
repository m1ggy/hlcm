import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { listTimeEntries } from "@/lib/actions/time-entries";
import { hoursBetween, formatDuration, formatMoney, summarizeByUser } from "@/lib/time-entries";
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
    if (!fromParam || !toParam) {
      return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    }
    const from = new Date(`${fromParam}T00:00:00`);
    const to = new Date(`${toParam}T23:59:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    const entries = await listTimeEntries({ userId, from, to });
    const totals = summarizeByUser(entries);
    const entriesByUser = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = entriesByUser.get(entry.userId) ?? [];
      list.push(entry);
      entriesByUser.set(entry.userId, list);
    }

    const rangeLabel = `${from.toLocaleDateString()} – ${to.toLocaleDateString()}`;

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
    page.drawText(`${rangeLabel} · Generated ${new Date().toLocaleString()}`, {
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
          entry.clockIn.toLocaleDateString(),
          entry.clockIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          entry.clockOut ? entry.clockOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
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
      page.drawText(
        `Subtotal: ${formatDuration(total.hours)}${total.pay != null ? ` · ${formatMoney(total.pay)}` : ""}`,
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
