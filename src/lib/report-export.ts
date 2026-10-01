import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { NextResponse } from "next/server";

// One report shape — a title plus titled tables — rendered three ways for
// the client/service/report exports (PDF §8: "Preferred exports: Excel, PDF
// and CSV"). Callers build the data once; nothing here knows about clients
// or invoices.

export type ExportColumn = { label: string; kind?: "text" | "money" | "number" | "date"; width?: number };
export type ExportCell = string | number | Date | null;
export type ExportSection = { title: string; columns: ExportColumn[]; rows: ExportCell[][]; footer?: ExportCell[] };
export type ExportDoc = { title: string; subtitle?: string; sections: ExportSection[] };
export type ExportFormat = "csv" | "xlsx" | "pdf";

export const EXPORT_FORMATS: ExportFormat[] = ["csv", "xlsx", "pdf"];

export function parseExportFormat(value: string | null): ExportFormat | null {
  return EXPORT_FORMATS.find((f) => f === value) ?? null;
}

// Calendar dates (invoice/service dates) are stored as UTC midnight — read
// the UTC fields so the exported day is the one that was typed in.
function formatDate(date: Date) {
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}

function formatMoney(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function cellText(cell: ExportCell, column: ExportColumn | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return formatDate(cell);
  if (typeof cell === "number") return column?.kind === "money" ? formatMoney(cell) : String(cell);
  return cell;
}

// ---- CSV: sections stacked, a blank line and the section title between.
function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(doc: ExportDoc): string {
  const lines: string[] = [csvEscape(doc.title)];
  if (doc.subtitle) lines.push(csvEscape(doc.subtitle));
  for (const section of doc.sections) {
    lines.push("", csvEscape(section.title));
    lines.push(section.columns.map((c) => csvEscape(c.label)).join(","));
    // Money as a plain number (no "$"/thousands separators) so it stays
    // numeric when the CSV is opened in a spreadsheet.
    const row = (cells: ExportCell[]) =>
      cells
        .map((cell, i) => {
          if (typeof cell === "number") return String(cell);
          return csvEscape(cellText(cell, section.columns[i]));
        })
        .join(",");
    for (const r of section.rows) lines.push(row(r));
    if (section.footer) lines.push(row(section.footer));
  }
  return lines.join("\n");
}

// ---- Excel: one sheet per section, real numbers/dates with formats.
export async function toXlsx(doc: ExportDoc): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const usedNames = new Set<string>();
  for (const section of doc.sections) {
    // Sheet names: max 31 chars, no []:*?/\ , unique.
    let name = section.title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
    for (let n = 2; usedNames.has(name); n++) name = `${name.slice(0, 28)} ${n}`;
    usedNames.add(name);
    const sheet = workbook.addWorksheet(name);
    sheet.columns = section.columns.map((c, i) => ({
      header: c.label,
      // Wide enough for the longest value, within reason.
      width: Math.max(10, Math.min(50, 2 + Math.max(c.label.length, ...section.rows.map((r) => cellText(r[i] ?? null, c).length)))),
      style:
        c.kind === "money"
          ? { numFmt: '"$"#,##0.00;[Red]-"$"#,##0.00' }
          : c.kind === "date"
            ? { numFmt: "m/d/yyyy" }
            : {},
    }));
    sheet.getRow(1).font = { bold: true };
    for (const r of section.rows) sheet.addRow(r.map((cell) => cell ?? ""));
    if (section.footer) sheet.addRow(section.footer.map((cell) => cell ?? "")).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// ---- PDF: landscape letter, sections one after another, columns sized
// by their `width` weights and text truncated to fit.
const PAGE: [number, number] = [792, 612];
const MARGIN = 40;
const ROW = 16;

function fit(text: string, font: PDFFont, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

// pdf-lib's standard fonts only encode WinAnsi — swap the few characters
// this app commonly produces that fall outside it.
function pdfSafe(text: string) {
  return text.replace(/[−–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF…]/g, "?");
}

export async function toPdf(doc: ExportDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const usable = PAGE[0] - MARGIN * 2;
  let page: PDFPage = pdf.addPage(PAGE);
  let y = PAGE[1] - MARGIN;

  const newPage = () => {
    page = pdf.addPage(PAGE);
    y = PAGE[1] - MARGIN;
  };
  const ensure = (space: number) => {
    if (y - space < MARGIN) newPage();
  };

  page.drawText(pdfSafe(doc.title), { x: MARGIN, y, size: 16, font: bold });
  y -= 18;
  const subtitle = [doc.subtitle, `Generated ${formatDate(new Date())}`].filter(Boolean).join(" · ");
  page.drawText(pdfSafe(subtitle), { x: MARGIN, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 22;

  for (const section of doc.sections) {
    // Text columns get twice the room of numbers/dates by default, and no
    // column is narrower than its own header.
    const weights = section.columns.map((c) =>
      Math.max(c.width ?? (c.kind === "text" || !c.kind ? 2 : 1.3), bold.widthOfTextAtSize(c.label, 9) / 45)
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalWeight) * usable);
    const drawRow = (cells: ExportCell[], f: PDFFont, shade = false) => {
      ensure(ROW);
      if (shade) page.drawRectangle({ x: MARGIN, y: y - 4, width: usable, height: ROW, color: rgb(0.95, 0.96, 0.98) });
      let x = MARGIN;
      section.columns.forEach((col, i) => {
        const text = fit(pdfSafe(cellText(cells[i] ?? null, col)), f, 9, widths[i] - 6);
        const right = col.kind === "money" || col.kind === "number";
        const tx = right ? x + widths[i] - 6 - f.widthOfTextAtSize(text, 9) : x;
        page.drawText(text, { x: tx, y, size: 9, font: f });
        x += widths[i];
      });
      y -= ROW;
    };
    const drawHeader = () => {
      drawRow(
        section.columns.map((c) => c.label),
        bold,
        true
      );
    };

    ensure(ROW * 4);
    page.drawText(pdfSafe(section.title), { x: MARGIN, y, size: 12, font: bold });
    y -= ROW + 2;
    drawHeader();
    if (section.rows.length === 0) {
      page.drawText("None", { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
      y -= ROW;
    }
    for (const r of section.rows) {
      if (y - ROW < MARGIN) {
        newPage();
        drawHeader();
      }
      drawRow(r, font);
    }
    if (section.footer) drawRow(section.footer, bold, true);
    y -= 14;
  }
  return pdf.save();
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
}

export async function exportResponse(doc: ExportDoc, format: ExportFormat, filenameBase = doc.title) {
  const name = slug(filenameBase);
  if (format === "csv") {
    return new NextResponse(toCsv(doc), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }
  if (format === "xlsx") {
    return new NextResponse(new Uint8Array(await toXlsx(doc)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  }
  return new NextResponse(Buffer.from(await toPdf(doc)), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` },
  });
}
