// Care Recipient invoice PDF — deliberately separate from
// generateInvoicePdf (src/lib/invoice-pdf.ts), which stays the renderer
// for a licensing Client's generic manual invoice. A Care Recipient
// invoice bills a person for hours/days of care, not a business for
// professional services, so it gets its own boxed header (with the
// recipient's DOB/SSN, when on file) and its own Home Services table
// instead of a plain Description/Qty/Amount list. Shares the low-level
// drawing helpers (wrapText, drawWrappedText, money, drawLogoOrName,
// PAGE_SIZE, MARGIN) with invoice-pdf.ts rather than duplicating them.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { displayInvoiceNumber, formatCalendarDate, formatCalendarWeekday } from "@/lib/invoice-format";
import { PAGE_SIZE, MARGIN, wrapText, drawWrappedText, money, drawLogoOrName, type InvoicePdfInput } from "@/lib/invoice-pdf";
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

function drawSectionHeading(page: PDFPage, text: string, yStart: number, boldFont: PDFFont): number {
  page.drawText(text, { x: MARGIN, y: yStart, size: 13, font: boldFont });
  return yStart - 22;
}

const VISIT_COLS = [
  { label: "Date", x: MARGIN, width: 75 },
  { label: "Home Service Worker", x: MARGIN + 75, width: 130 },
  { label: "Times", x: MARGIN + 205, width: 110 },
  { label: "Hours", x: MARGIN + 315, width: 50 },
  { label: "Rate", x: MARGIN + 365, width: 90 },
  { label: "Fees", x: MARGIN + 455, width: 60 },
];

// VISIT_HOURLY and VISIT_DAILY both render through this one table — a
// daily/live-in row has no caregiver attribution (see the plan's
// "Out of scope" note), so its Worker column shows the day name and its
// Times column shows "Live-in" instead.
function drawVisitTable(page: PDFPage, font: PDFFont, boldFont: PDFFont, yStart: number, items: CareRecipientLineItem[]): number {
  let y = yStart;
  const tableWidth = PAGE_SIZE[0] - MARGIN * 2;
  const headerHeight = 20;
  page.drawRectangle({ x: MARGIN, y: y - headerHeight + 6, width: tableWidth, height: headerHeight, color: rgb(0.55, 0.55, 0.55) });
  for (const col of VISIT_COLS) {
    page.drawText(col.label, { x: col.x + 4, y: y - 8, size: 9, font: boldFont, color: rgb(1, 1, 1) });
  }
  y -= headerHeight;

  let totalHours = 0;
  let totalFees = 0;
  items.forEach((li, i) => {
    const rowHeight = 20;
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowHeight + 6, width: tableWidth, height: rowHeight, color: rgb(0.96, 0.96, 0.96) });
    }
    const isDaily = li.kind === "VISIT_DAILY";
    const dateStr = li.visitDate ? formatCalendarDate(li.visitDate) : "";
    const workerStr = isDaily ? (li.visitDate ? formatCalendarWeekday(li.visitDate) : "") : li.workerName ?? "";
    const timesStr = isDaily ? "Live-in" : li.visitStart && li.visitEnd ? `${formatTime(li.visitStart)}-${formatTime(li.visitEnd)}` : "";
    const fees = li.quantity * li.unitPrice;
    const rateStr = isDaily ? `${money(li.unitPrice)}/Daily` : `${money(li.unitPrice)}/Hourly`;

    page.drawText(dateStr, { x: VISIT_COLS[0].x + 4, y: y - 8, size: 9, font });
    page.drawText(workerStr, { x: VISIT_COLS[1].x + 4, y: y - 8, size: 9, font, maxWidth: VISIT_COLS[1].width - 8 });
    page.drawText(timesStr, { x: VISIT_COLS[2].x + 4, y: y - 8, size: 9, font });
    page.drawText(String(li.quantity), { x: VISIT_COLS[3].x + 4, y: y - 8, size: 9, font });
    page.drawText(rateStr, { x: VISIT_COLS[4].x + 4, y: y - 8, size: 9, font });
    page.drawText(money(fees), { x: VISIT_COLS[5].x + 4, y: y - 8, size: 9, font });

    totalHours += li.quantity;
    totalFees += fees;
    y -= rowHeight;
  });

  const totalsRowHeight = 20;
  page.drawRectangle({ x: MARGIN, y: y - totalsRowHeight + 6, width: tableWidth, height: totalsRowHeight, color: rgb(0.9, 0.9, 0.9) });
  page.drawText("Home Services Totals", { x: VISIT_COLS[0].x + 4, y: y - 8, size: 9, font: boldFont });
  page.drawText(String(totalHours), { x: VISIT_COLS[3].x + 4, y: y - 8, size: 9, font: boldFont });
  page.drawText(money(totalFees), { x: VISIT_COLS[5].x + 4, y: y - 8, size: 9, font: boldFont });
  return y - totalsRowHeight;
}

// MANUAL line items keep today's plain Description/Qty/Amount shape —
// same as generateInvoicePdf's own table, just under an "Other Charges"
// heading so it's visually distinct from the Home Services table above it.
function drawManualTable(page: PDFPage, font: PDFFont, boldFont: PDFFont, yStart: number, items: CareRecipientLineItem[]): number {
  let y = yStart;
  const cols = [
    { label: "Description", x: MARGIN, width: 340 },
    { label: "Quantity", x: MARGIN + 340, width: 80 },
    { label: "Amount", x: MARGIN + 420, width: 90 },
  ];
  for (const col of cols) page.drawText(col.label, { x: col.x, y, size: 10, font: boldFont });
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_SIZE[0] - MARGIN, y }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
  y -= 18;
  for (const li of items) {
    const amount = li.quantity * li.unitPrice;
    page.drawText(li.description, { x: cols[0].x, y, size: 10, font, maxWidth: cols[0].width - 10 });
    page.drawText(String(li.quantity), { x: cols[1].x, y, size: 10, font });
    page.drawText(money(amount), { x: cols[2].x, y, size: 10, font });
    y -= 20;
  }
  return y;
}

function drawTotalsBlock(page: PDFPage, font: PDFFont, boldFont: PDFFont, yStart: number, input: CareRecipientInvoicePdfInput): number {
  const subtotal = input.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const total = input.total ?? subtotal;
  const currentBalance = total - (input.amountPaid ?? 0);
  const asOf = new Date().toLocaleDateString();
  const tableWidth = PAGE_SIZE[0] - MARGIN * 2;

  const rows = [
    { label: "Current Invoice Total", value: money(total) },
    { label: "Current Invoice Balance", value: money(currentBalance) },
    { label: `Outstanding Account Balance (All Invoices) as of ${asOf}`, value: money(input.outstandingAccountBalance) },
  ];

  let y = yStart;
  const rowHeight = 22;
  rows.forEach((row, i) => {
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowHeight + 6, width: tableWidth, height: rowHeight, color: rgb(0.95, 0.95, 0.95) });
    }
    page.drawText(row.label, { x: MARGIN + 10, y: y - 10, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    const valueWidth = font.widthOfTextAtSize(row.value, 10);
    page.drawText(row.value, { x: MARGIN + tableWidth - 10 - valueWidth, y: y - 10, size: 10, font });
    y -= rowHeight;
  });

  const dueLabel = `Total Amount Due as of ${asOf}`;
  const dueValue = money(input.outstandingAccountBalance);
  const dueRowHeight = 34;
  page.drawRectangle({ x: MARGIN, y: y - dueRowHeight + 6, width: tableWidth, height: dueRowHeight, color: rgb(0.88, 0.88, 0.88) });
  page.drawText(dueLabel, { x: MARGIN + 10, y: y - 14, size: 11, font: boldFont });
  const dueValueWidth = boldFont.widthOfTextAtSize(dueValue, 14);
  page.drawText(dueValue, { x: MARGIN + tableWidth - 10 - dueValueWidth, y: y - 18, size: 14, font: boldFont });
  const dueNote =
    input.status === "PAID"
      ? "(Paid in full)"
      : input.dueDate
        ? `(Due: ${formatCalendarDate(input.dueDate)})`
        : "(Due: Upon Receipt)";
  const dueNoteWidth = font.widthOfTextAtSize(dueNote, 8);
  page.drawText(dueNote, { x: MARGIN + tableWidth - 10 - dueNoteWidth, y: y - 30, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  return y - dueRowHeight;
}

export async function generateCareRecipientInvoicePdf(input: CareRecipientInvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  await drawLogoOrName(pdfDoc, page, { x: MARGIN, y, boldFont, logo: input.logo, profileName: input.profileName });
  y -= 70;

  // --- Boxed header: Bill To / patient info (left), invoice meta (right) --
  const recipient = input.careRecipient;
  const billTo = recipient.billingContactName || recipient.name;
  const boxAddressWidth = 230;

  type HeaderLine = { text: string; font: PDFFont; size: number; color?: ReturnType<typeof rgb> };
  const leftLines: HeaderLine[] = [
    { text: "Official Invoice", font: boldFont, size: 11 },
    { text: billTo, font: boldFont, size: 12 },
  ];
  if (recipient.billingContactName && recipient.billingContactName !== recipient.name) {
    leftLines.push({ text: `Care of: ${recipient.name}`, font, size: 9, color: rgb(0.3, 0.3, 0.3) });
  }
  for (const line of wrapText(recipient.address ?? "", font, 10, boxAddressWidth)) {
    if (line) leftLines.push({ text: line, font, size: 10, color: rgb(0.3, 0.3, 0.3) });
  }
  if (recipient.dateOfBirth) {
    leftLines.push({ text: `Date of Birth: ${formatCalendarDate(recipient.dateOfBirth)}`, font, size: 9, color: rgb(0.3, 0.3, 0.3) });
  }
  if (recipient.socialSecurityNumber) {
    leftLines.push({
      text: `Social Security Number: ${maskSsn(recipient.socialSecurityNumber)}`,
      font,
      size: 9,
      color: rgb(0.3, 0.3, 0.3),
    });
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
  ];

  const lineHeight = 15;
  const boxPadding = 14;
  const boxHeight = Math.max(leftLines.length, rightLines.length) * lineHeight + boxPadding * 2 - lineHeight + 6;
  const boxTop = y;
  const boxBottom = y - boxHeight;

  page.drawRectangle({
    x: MARGIN,
    y: boxBottom,
    width: PAGE_SIZE[0] - MARGIN * 2,
    height: boxHeight,
    color: rgb(0.96, 0.96, 0.96),
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 0.75,
  });

  let ly = boxTop - boxPadding;
  for (const line of leftLines) {
    page.drawText(line.text, { x: MARGIN + 14, y: ly, size: line.size, font: line.font, color: line.color });
    ly -= lineHeight;
  }

  let ry = boxTop - boxPadding;
  const rightX = PAGE_SIZE[0] - MARGIN - 14;
  for (const line of rightLines) {
    const width = font.widthOfTextAtSize(line, 10);
    page.drawText(line, { x: rightX - width, y: ry, size: 10, font });
    ry -= lineHeight;
  }

  y = boxBottom - 30;

  // --- Home Services / Other Charges tables ------------------------------
  const hourly = input.lineItems.filter((li) => li.kind === "VISIT_HOURLY");
  const daily = input.lineItems.filter((li) => li.kind === "VISIT_DAILY");
  const manual = input.lineItems.filter((li) => li.kind === "MANUAL");

  if (hourly.length || daily.length) {
    y = drawSectionHeading(page, "Home Services", y, boldFont);
    y = drawVisitTable(page, font, boldFont, y, [...hourly, ...daily]);
    y -= 20;
  }

  if (manual.length) {
    y = drawSectionHeading(page, "Other Charges", y, boldFont);
    y = drawManualTable(page, font, boldFont, y, manual);
    y -= 20;
  }

  y = drawTotalsBlock(page, font, boldFont, y, input);
  y -= 20;

  if (input.notes) {
    page.drawText("Notes", { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 14;
    const notesHeight = drawWrappedText(page, input.notes, {
      x: MARGIN,
      y,
      font,
      size: 10,
      maxWidth: PAGE_SIZE[0] - MARGIN * 2,
      lineHeight: 14,
    });
    y -= notesHeight + 20;
  }

  if (input.footerText) {
    page.drawLine({
      start: { x: MARGIN, y: y + 14 },
      end: { x: PAGE_SIZE[0] - MARGIN, y: y + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    drawWrappedText(page, input.footerText, {
      x: MARGIN,
      y,
      font,
      size: 8,
      color: rgb(0.55, 0.55, 0.55),
      maxWidth: PAGE_SIZE[0] - MARGIN * 2,
      lineHeight: 11,
    });
  }

  return pdfDoc.save();
}
