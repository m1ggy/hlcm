import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { listApplications } from "@/lib/actions/applications";
import { STATUS_LABELS, ApplicationStatus } from "@/lib/status";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;
const ROW_HEIGHT = 20;
const COLUMNS = [
  { label: "Name", width: 190 },
  { label: "Client", width: 120 },
  { label: "Assigned To", width: 110 },
  { label: "Status", width: 80 },
  { label: "Created", width: 76 },
];

function truncate(text: string, maxChars: number) {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export async function GET() {
  try {
    const applications = await listApplications();
    const rows = applications.map((app) => [
      app.name,
      app.client.name,
      app.assignedUser.name,
      STATUS_LABELS[app.status as ApplicationStatus],
      new Date(app.createdAt).toLocaleDateString(),
    ]);

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage(PAGE_SIZE);
    let y = PAGE_SIZE[1] - MARGIN;

    function drawHeader() {
      page.drawText("Applications Summary", {
        x: MARGIN,
        y,
        size: 16,
        font: boldFont,
      });
      y -= 20;
      page.drawText(`Generated ${new Date().toLocaleString()}`, {
        x: MARGIN,
        y,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      y -= 24;

      let x = MARGIN;
      for (const col of COLUMNS) {
        page.drawText(col.label, { x, y, size: 10, font: boldFont });
        x += col.width;
      }
      y -= 6;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_SIZE[0] - MARGIN, y },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= ROW_HEIGHT;
    }

    drawHeader();

    for (const row of rows) {
      if (y < MARGIN) {
        page = pdfDoc.addPage(PAGE_SIZE);
        y = PAGE_SIZE[1] - MARGIN;
        drawHeader();
      }
      let x = MARGIN;
      row.forEach((value, i) => {
        const col = COLUMNS[i];
        page.drawText(truncate(value, Math.floor(col.width / 5.5)), {
          x,
          y,
          size: 9,
          font,
        });
        x += col.width;
      });
      y -= ROW_HEIGHT;
    }

    const bytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="applications.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
