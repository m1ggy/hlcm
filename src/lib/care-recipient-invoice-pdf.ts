// Care Recipient invoice PDF — deliberately separate from
// generateInvoicePdf (src/lib/invoice-pdf.ts), which stays the renderer
// for a licensing Client's generic manual invoice. A Care Recipient
// invoice bills a person for hours/days of care, not a business for
// professional services, so it gets its own boxed header (with the
// recipient's DOB/SSN, when on file) and its own Home Services table
// instead of a plain Description/Qty/Amount list. Shares the low-level
// drawing helpers (wrapText, drawFitted, PageCursor, money,
// drawLogoOrName, PAGE_SIZE, MARGIN) with invoice-pdf.ts rather than duplicating them.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { displayInvoiceNumber, formatCalendarDate, formatCalendarWeekday } from "@/lib/invoice-format";
import {
  PAGE_SIZE,
  MARGIN,
  PageCursor,
  wrapText,
  drawFitted,
  drawWrappedTextPaged,
  money,
  drawLogoOrName,
  type InvoicePdfInput,
} from "@/lib/invoice-pdf";
import type { $Enums } from "@/generated/prisma/client";

export type CareRecipientLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  kind: $Enums.InvoiceLineItemKind;
  visitDate: Date | null;
  visitStart: Date | null;
  visitEnd: Date | null;
  workerName: string | null;
};

export type CareRecipientInvoicePdfInput = Omit<InvoicePdfInput, "careRecipient" | "lineItems"> & {
  careRecipient: {
    name: string;
    address: string | null;
    billingContactName: string | null;
    dateOfBirth: Date | null;
    socialSecurityNumber: string | null;
  };
  lineItems: CareRecipientLineItem[];
  /** Sum of (total - amountPaid) across every non-VOID invoice billed to
   * this recipient, this one included — a DB query this otherwise-pure
   * renderer shouldn't make itself, so the caller computes it (see
   * computeOutstandingAccountBalance in
   * src/lib/actions/care-recipient-invoices.ts) and passes it in. */
  outstandingAccountBalance: number;
};

function formatTime(d: Date): string {
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}${ampm}`;
}

// Only the last 4 digits ever print — same masking convention as image
// (3)'s reference sample ("xxxxx7434"). Plain storage, no encryption at
// rest, matching the existing ClientCredential.password trade-off.
function maskSsn(ssn: string): string {
  const last4 = ssn.replace(/\D/g, "").slice(-4);
  return last4 ? `xxxxx${last4}` : "•••••";
}

// The invoice's own billing period — staff-entered (Invoice.periodStart/
// periodEnd), since the actual billing cycle doesn't necessarily match
// exactly which days got logged/billed. Only derived from line items'
// visitDate as a fallback for an invoice nobody set it on (older invoices
// from before this field existed, or a form left blank), falling back
// further to issueDate on both ends for an all-manual invoice with no
// visit-dated line either.
function periodOf(
  input: Pick<CareRecipientInvoicePdfInput, "periodStart" | "periodEnd" | "issueDate" | "lineItems">
): { start: Date; end: Date } {
  if (input.periodStart && input.periodEnd) return { start: input.periodStart, end: input.periodEnd };
  const times = input.lineItems.map((li) => li.visitDate?.getTime()).filter((t): t is number => t != null);
  if (times.length === 0) return { start: input.issueDate, end: input.issueDate };
  return { start: new Date(Math.min(...times)), end: new Date(Math.max(...times)) };
}

const RIGHT = PAGE_SIZE[0] - MARGIN;
const TABLE_WIDTH = RIGHT - MARGIN;

function drawSectionHeading(cursor: PageCursor, text: string, boldFont: PDFFont) {
  // Keep a heading with at least its table's header and first row.
  cursor.ensure(70);
  drawFitted(cursor.page, text, { x: MARGIN, y: cursor.y, size: 13, font: boldFont, maxWidth: TABLE_WIDTH });
  cursor.y -= 22;
}

const VISIT_COLS = [
  { label: "Date", x: MARGIN, width: 75 },
  { label: "Home Service Worker", x: MARGIN + 75, width: 130 },
  { label: "Times", x: MARGIN + 205, width: 110 },
  { label: "Hours", x: MARGIN + 315, width: 50 },
  { label: "Rate", x: MARGIN + 365, width: 90 },
  { label: "Fees", x: MARGIN + 455, width: TABLE_WIDTH - 455 },
];

// VISIT_HOURLY and VISIT_DAILY both render through this one table — a
// daily/live-in row has no caregiver attribution (see the plan's
// "Out of scope" note), so its Worker column shows the day name and its
// Times column shows "Live-in" instead. The worker's name wraps and the
// row grows to fit; the header repeats on a continuation page.
function drawVisitTable(cursor: PageCursor, font: PDFFont, boldFont: PDFFont, items: CareRecipientLineItem[]) {
  const headerHeight = 20;
  const drawHeader = () => {
    cursor.page.drawRectangle({
      x: MARGIN,
      y: cursor.y - headerHeight + 6,
      width: TABLE_WIDTH,
      height: headerHeight,
      color: rgb(0.55, 0.55, 0.55),
    });
    for (const col of VISIT_COLS) {
      cursor.page.drawText(col.label, { x: col.x + 4, y: cursor.y - 8, size: 9, font: boldFont, color: rgb(1, 1, 1) });
    }
    cursor.y -= headerHeight;
  };
  cursor.ensure(headerHeight + 20);
  drawHeader();

  let totalHours = 0;
  let totalFees = 0;
  items.forEach((li, i) => {
    const isDaily = li.kind === "VISIT_DAILY";
    const dateStr = li.visitDate ? formatCalendarDate(li.visitDate) : "";
    // A day-rate line can now name the caregiver who provided the care
    // (see DayRateSection's own caregiver picker) — prefer that when set,
    // falling back to the day of week only for older invoices made before
    // that picker existed.
    const workerStr = li.workerName || (isDaily && li.visitDate ? formatCalendarWeekday(li.visitDate) : "");
    const timesStr = isDaily ? "Live-in" : li.visitStart && li.visitEnd ? `${formatTime(li.visitStart)}-${formatTime(li.visitEnd)}` : "";
    const fees = li.quantity * li.unitPrice;
    const rateStr = isDaily ? `${money(li.unitPrice)}/Daily` : `${money(li.unitPrice)}/Hourly`;

    const workerLines = wrapText(workerStr, font, 9, VISIT_COLS[1].width - 8);
    const rowHeight = Math.max(20, workerLines.length * 11 + 9);
    if (cursor.ensure(rowHeight)) drawHeader();
    if (i % 2 === 1) {
      cursor.page.drawRectangle({ x: MARGIN, y: cursor.y - rowHeight + 6, width: TABLE_WIDTH, height: rowHeight, color: rgb(0.96, 0.96, 0.96) });
    }
    const y = cursor.y - 8;
    const cell = (col: number, text: string) =>
      drawFitted(cursor.page, text, { x: VISIT_COLS[col].x + 4, y, size: 9, font, maxWidth: VISIT_COLS[col].width - 8 });
    cell(0, dateStr);
    workerLines.forEach((line, n) => cursor.page.drawText(line, { x: VISIT_COLS[1].x + 4, y: y - n * 11, size: 9, font }));
    cell(2, timesStr);
    cell(3, String(li.quantity));
    cell(4, rateStr);
    cell(5, money(fees));

    totalHours += li.quantity;
    totalFees += fees;
    cursor.y -= rowHeight;
  });

  const totalsRowHeight = 20;
  cursor.ensure(totalsRowHeight);
  cursor.page.drawRectangle({ x: MARGIN, y: cursor.y - totalsRowHeight + 6, width: TABLE_WIDTH, height: totalsRowHeight, color: rgb(0.9, 0.9, 0.9) });
  const y = cursor.y - 8;
  cursor.page.drawText("Home Services Totals", { x: VISIT_COLS[0].x + 4, y, size: 9, font: boldFont });
  drawFitted(cursor.page, String(totalHours), { x: VISIT_COLS[3].x + 4, y, size: 9, font: boldFont, maxWidth: VISIT_COLS[3].width - 8 });
  drawFitted(cursor.page, money(totalFees), { x: VISIT_COLS[5].x + 4, y, size: 9, font: boldFont, maxWidth: VISIT_COLS[5].width - 8 });
  cursor.y -= totalsRowHeight;
}

// MANUAL line items keep today's plain Description/Hours/Amount shape —
// same as generateInvoicePdf's own table, just under an "Other Charges"
// heading so it's visually distinct from the Home Services table above it.
function drawManualTable(cursor: PageCursor, font: PDFFont, boldFont: PDFFont, items: CareRecipientLineItem[]) {
  const cols = [
    { label: "Description", x: MARGIN, width: 330 },
    { label: "Hours", x: MARGIN + 340, width: 70 },
    { label: "Amount", x: MARGIN + 420, width: TABLE_WIDTH - 420 },
  ];
  const drawHeader = () => {
    for (const col of cols) cursor.page.drawText(col.label, { x: col.x, y: cursor.y, size: 10, font: boldFont });
    cursor.y -= 6;
    cursor.page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: RIGHT, y: cursor.y }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
    cursor.y -= 18;
  };
  cursor.ensure(40);
  drawHeader();
  for (const li of items) {
    const lines = wrapText(li.description, font, 10, cols[0].width);
    const height = lines.length * 13 + 7;
    if (cursor.ensure(height)) drawHeader();
    lines.forEach((line, i) => cursor.page.drawText(line, { x: cols[0].x, y: cursor.y - i * 13, size: 10, font }));
    drawFitted(cursor.page, String(li.quantity), { x: cols[1].x, y: cursor.y, size: 10, font, maxWidth: cols[1].width });
    drawFitted(cursor.page, money(li.quantity * li.unitPrice), { x: cols[2].x, y: cursor.y, size: 10, font, maxWidth: cols[2].width });
    cursor.y -= height;
  }
}

function drawTotalsBlock(cursor: PageCursor, font: PDFFont, boldFont: PDFFont, input: CareRecipientInvoicePdfInput) {
  const subtotal = input.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const total = input.total ?? subtotal;
  const currentBalance = total - (input.amountPaid ?? 0);
  const asOf = new Date().toLocaleDateString();

  const rows = [
    { label: "Current Invoice Total", value: money(total) },
    { label: "Current Invoice Balance", value: money(currentBalance) },
    { label: `Outstanding Account Balance (All Invoices) as of ${asOf}`, value: money(input.outstandingAccountBalance) },
  ];

  // The whole block stays together on one page.
  const rowHeight = 22;
  const dueRowHeight = 34;
  cursor.ensure(rows.length * rowHeight + dueRowHeight);
  const page = cursor.page;
  const valueWidth = 150;
  rows.forEach((row, i) => {
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: cursor.y - rowHeight + 6, width: TABLE_WIDTH, height: rowHeight, color: rgb(0.95, 0.95, 0.95) });
    }
    drawFitted(page, row.label, { x: MARGIN + 10, y: cursor.y - 10, size: 10, font, maxWidth: TABLE_WIDTH - valueWidth - 30, color: rgb(0.3, 0.3, 0.3) });
    drawFitted(page, row.value, { right: RIGHT - 10, y: cursor.y - 10, size: 10, font, maxWidth: valueWidth });
    cursor.y -= rowHeight;
  });

  page.drawRectangle({ x: MARGIN, y: cursor.y - dueRowHeight + 6, width: TABLE_WIDTH, height: dueRowHeight, color: rgb(0.88, 0.88, 0.88) });
  drawFitted(page, `Total Amount Due as of ${asOf}`, {
    x: MARGIN + 10,
    y: cursor.y - 14,
    size: 11,
    font: boldFont,
    maxWidth: TABLE_WIDTH - valueWidth - 30,
  });
  drawFitted(page, money(input.outstandingAccountBalance), {
    right: RIGHT - 10,
    y: cursor.y - 18,
    size: 14,
    minSize: 8,
    font: boldFont,
    maxWidth: valueWidth,
  });
  const dueNote =
    input.status === "PAID"
      ? "(Paid in full)"
      : input.dueDate
        ? `(Due: ${formatCalendarDate(input.dueDate)})`
        : "(Due: Upon Receipt)";
  drawFitted(page, dueNote, { right: RIGHT - 10, y: cursor.y - 30, size: 8, font, maxWidth: valueWidth, color: rgb(0.4, 0.4, 0.4) });
  cursor.y -= dueRowHeight;
}

export async function generateCareRecipientInvoicePdf(input: CareRecipientInvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const cursor = new PageCursor(pdfDoc);
  const page = cursor.page;

  await drawLogoOrName(pdfDoc, page, {
    x: MARGIN,
    y: cursor.y,
    boldFont,
    logo: input.logo,
    profileName: input.profileName,
    maxWidth: TABLE_WIDTH,
  });
  cursor.y -= 70;

  // --- Boxed header: Bill To / patient info (left), invoice meta (right) --
  // Each side wraps within its own half of the box, and the box grows to
  // the taller side.
  const recipient = input.careRecipient;
  const billTo = recipient.billingContactName || recipient.name;
  const boxPadding = 14;
  const halfWidth = (TABLE_WIDTH - boxPadding * 2) / 2 - 8;

  type HeaderLine = { text: string; font: PDFFont; size: number; color?: ReturnType<typeof rgb> };
  const leftLines: HeaderLine[] = [];
  const pushWrapped = (text: string, f: PDFFont, size: number, color?: ReturnType<typeof rgb>) => {
    for (const line of wrapText(text, f, size, halfWidth)) if (line) leftLines.push({ text: line, font: f, size, color });
  };
  pushWrapped("Official Invoice", boldFont, 11);
  pushWrapped(billTo, boldFont, 12);
  if (recipient.billingContactName && recipient.billingContactName !== recipient.name) {
    pushWrapped(`Care of: ${recipient.name}`, font, 9, rgb(0.3, 0.3, 0.3));
  }
  pushWrapped(recipient.address ?? "", font, 10, rgb(0.3, 0.3, 0.3));
  if (recipient.dateOfBirth) {
    pushWrapped(`Date of Birth: ${formatCalendarDate(recipient.dateOfBirth)}`, font, 9, rgb(0.3, 0.3, 0.3));
  }
  if (recipient.socialSecurityNumber) {
    pushWrapped(`Social Security Number: ${maskSsn(recipient.socialSecurityNumber)}`, font, 9, rgb(0.3, 0.3, 0.3));
  }

  const period = periodOf(input);
  const total = input.total ?? input.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  // This invoice's own balance, not outstandingAccountBalance (the summed
  // balance across every invoice this recipient has) — that combined
  // figure is deliberately shown further down as "Outstanding Account
  // Balance (All Invoices)"/"Total Amount Due", clearly labeled as such.
  // Printing it up here too, under the unqualified "Amount Owed", made two
  // separate invoices for the same recipient print the identical
  // account-wide number as if it were each one's own amount due.
  const currentBalance = total - (input.amountPaid ?? 0);
  const rightLines = [
    `Invoice ID#: ${displayInvoiceNumber(input)}`,
    `Period: ${formatCalendarDate(period.start)} - ${formatCalendarDate(period.end)}`,
    `Invoice Date: ${formatCalendarDate(input.issueDate)}`,
    `Due: ${input.dueDate ? formatCalendarDate(input.dueDate) : "Upon Receipt"}`,
    `Current Invoice Balance: ${money(currentBalance)}`,
    `Amount Owed: ${money(currentBalance)}`,
  ].flatMap((line) => wrapText(line, font, 10, halfWidth));

  const lineHeight = 15;
  const boxHeight = Math.max(leftLines.length, rightLines.length) * lineHeight + boxPadding * 2 - lineHeight + 6;
  const boxTop = cursor.y;
  const boxBottom = cursor.y - boxHeight;

  page.drawRectangle({
    x: MARGIN,
    y: boxBottom,
    width: TABLE_WIDTH,
    height: boxHeight,
    color: rgb(0.96, 0.96, 0.96),
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 0.75,
  });

  let ly = boxTop - boxPadding;
  for (const line of leftLines) {
    page.drawText(line.text, { x: MARGIN + boxPadding, y: ly, size: line.size, font: line.font, color: line.color });
    ly -= lineHeight;
  }

  let ry = boxTop - boxPadding;
  const rightX = RIGHT - boxPadding;
  for (const line of rightLines) {
    page.drawText(line, { x: rightX - font.widthOfTextAtSize(line, 10), y: ry, size: 10, font });
    ry -= lineHeight;
  }

  cursor.y = boxBottom - 30;

  // --- Home Services / Other Charges tables ------------------------------
  const hourly = input.lineItems.filter((li) => li.kind === "VISIT_HOURLY");
  const daily = input.lineItems.filter((li) => li.kind === "VISIT_DAILY");
  const manual = input.lineItems.filter((li) => li.kind === "MANUAL");

  if (hourly.length || daily.length) {
    drawSectionHeading(cursor, "Home Services", boldFont);
    drawVisitTable(cursor, font, boldFont, [...hourly, ...daily]);
    cursor.y -= 20;
  }

  if (manual.length) {
    drawSectionHeading(cursor, "Other Charges", boldFont);
    drawManualTable(cursor, font, boldFont, manual);
    cursor.y -= 20;
  }

  drawTotalsBlock(cursor, font, boldFont, input);
  cursor.y -= 20;

  if (input.notes) {
    cursor.ensure(30);
    cursor.page.drawText("Notes", { x: MARGIN, y: cursor.y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    cursor.y -= 14;
    drawWrappedTextPaged(cursor, input.notes, { x: MARGIN, font, size: 10, maxWidth: TABLE_WIDTH, lineHeight: 14 });
    cursor.y -= 20;
  }

  if (input.footerText) {
    cursor.ensure(24);
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y + 14 },
      end: { x: RIGHT, y: cursor.y + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    drawWrappedTextPaged(cursor, input.footerText, {
      x: MARGIN,
      font,
      size: 8,
      color: rgb(0.55, 0.55, 0.55),
      maxWidth: TABLE_WIDTH,
      lineHeight: 11,
    });
  }

  return pdfDoc.save();
}
