// The Modern invoice layout — see ./modern-shared.ts for where it comes
// from. Same input as the Classic generateInvoicePdf (src/lib/invoice-pdf.ts),
// plus the profile's sender details. A running invoice: every line shows
// the date it was added, its amount, what's still due on it and what's been
// paid (with a PAID / PARTIAL / OPEN tag), the payments received so far are
// listed under the totals, and the total due is the remaining balance (see
// lineBalances). "Statement as of" dates each copy, since the same invoice
// number is sent again as it grows.
import { currentOrganization } from "@/lib/db";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { PAGE_SIZE, drawFitted, embedPdfFont, fitText, money, wrapText, type InvoicePdfInput } from "@/lib/invoice-pdf";
import { displayInvoiceNumber, lineBalances } from "@/lib/invoice-format";
import { DEFAULT_TIMEZONE, toDateInputValue } from "@/lib/time-entries";
import {
  BOTTOM_LIMIT,
  CREAM,
  GOLD,
  GRAY,
  GRID,
  LEFT,
  LIGHT_BLUE,
  NAVY,
  RIGHT,
  STEEL,
  WHITE,
  box,
  closingHeight,
  drawClosing,
  drawInfoBox,
  drawModernHeader,
  drawPageFooters,
  drawPartyBox,
  hline,
  infoBoxHeight,
  shortDate,
  text,
  textCenter,
  textRight,
  yFromTop,
  type Fonts,
} from "./modern-shared";

type Col = { x: number; width: number };

// Date / Description / Amount / Amount Due / Amount Paid, left edges + widths.
const COLS: Col[] = [
  { x: LEFT, width: 52 },
  { x: LEFT + 52, width: 300 - LEFT - 52 },
  { x: 300, width: 94 },
  { x: 394, width: 95 },
  { x: 489, width: RIGHT - 489 },
];
const LINE_LABELS = ["DATE", "ITEM / DESCRIPTION", "AMOUNT", "AMOUNT DUE", "AMOUNT PAID"];

// Payments received: Date / Method / Reference / Applied to / Amount.
const PAY_COLS: Col[] = [
  { x: LEFT, width: 52 },
  { x: LEFT + 52, width: 70 },
  { x: LEFT + 122, width: 84 },
  { x: LEFT + 206, width: 489 - LEFT - 206 },
  { x: 489, width: RIGHT - 489 },
];
const PAY_LABELS = ["DATE", "METHOD", "REFERENCE", "APPLIED TO", "AMOUNT"];

const BALANCE_ROW_HEIGHT = 34;
const HEADER_HEIGHT = 28;
const TOTAL_ROW_HEIGHT = 24;
const SECTION_LABEL_HEIGHT = 22;
const PAY_ROW_HEIGHT = 22;
// The sample always shows at least five rows, blank ones included.
const MIN_ROWS = 5;
const DESCRIPTION_SIZE = 9;
const DESCRIPTION_LINE = 11;
// Room kept at the right of the description cell for the status tag.
const TAG_SPACE = 44;

const TAGS = {
  PAID: { label: "PAID", fill: rgb(0.89, 0.953, 0.898), color: rgb(0.18, 0.49, 0.2) },
  PARTIAL: { label: "PARTIAL", fill: rgb(1, 0.949, 0.851), color: rgb(0.66, 0.42, 0) },
  OPEN: { label: "OPEN", fill: rgb(0.992, 0.91, 0.91), color: rgb(0.7, 0.15, 0.12) },
} as const;
type Tag = keyof typeof TAGS;

type Row = { date: string; description: string[]; amount: string; due: string; paid: string; tag: Tag | null; height: number };

export async function generateModernInvoicePdf(invoice: InvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts: Fonts = {
    font: await embedPdfFont(pdfDoc, StandardFonts.Helvetica),
    bold: await embedPdfFont(pdfDoc, StandardFonts.HelveticaBold),
  };
  const profileName = invoice.profileName ?? (await currentOrganization()).name;

  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const total = invoice.total ?? subtotal;
  const paidTotal = invoice.amountPaid ?? 0;
  const balance = Math.max(0, total - paidTotal);
  const isVoid = invoice.status === "VOID";
  const balances = lineBalances(invoice.lineItems, invoice.amountPaid, invoice.payments);
  // Today's calendar date where the business is, as a UTC-midnight Date —
  // what shortDate expects.
  const statementDate = new Date(toDateInputValue(new Date(), DEFAULT_TIMEZONE));

  let page = pdfDoc.addPage(PAGE_SIZE);
  const ruleTop = await drawModernHeader(pdfDoc, page, fonts, {
    title: "INVOICE",
    meta: [
      { label: "Invoice #:", value: displayInvoiceNumber(invoice) },
      { label: "Issued:", value: shortDate(invoice.issueDate) },
      { label: "Statement as of:", value: shortDate(statementDate) },
      { label: "Due:", value: invoice.dueDate ? shortDate(invoice.dueDate) : "Upon receipt" },
    ],
    logo: invoice.logo,
    profileName,
    sender: invoice.sender ?? null,
  });

  // Bill To — a Care Recipient invoice addresses the actual payer, same
  // as the Classic layout (though those normally render through
  // generateCareRecipientInvoicePdf instead). Attn and address only print
  // when there's something to show.
  const recipient = invoice.careRecipient;
  const address = recipient
    ? recipient.address ?? ""
    : [invoice.client.billingAddressLine1, invoice.client.billingCity, invoice.client.billingState, invoice.client.billingPostalCode]
        .filter(Boolean)
        .join(", ");
  const attn = recipient ? (recipient.billingContactName ? recipient.name : "") : invoice.client.owners?.[0]?.name ?? "";
  const billToBottom = drawPartyBox(page, fonts, {
    top: ruleTop + 28,
    label: "BILL TO",
    compact: true,
    lines: [
      {
        label: "Client / Company Name:  ",
        value: (recipient ? recipient.billingContactName || recipient.name : invoice.client.businessName ?? invoice.client.name).toUpperCase(),
      },
      ...(attn ? [{ label: "Attn: ", value: attn }] : []),
      ...(address ? [{ label: "Address / City / State: ", value: address }] : []),
    ],
  });

  const baseHeight = invoice.lineItems.length <= MIN_ROWS ? 28 : 24;
  const rows: Row[] = invoice.lineItems.map((li, i) => {
    // QTY isn't a column any more; a line billed by the hour (or any
    // quantity other than one) keeps that detail in its description.
    const label = li.quantity === 1 ? li.description : `${li.description} (${li.quantity} × ${money(li.unitPrice)})`;
    const description = wrapText(label, fonts.font, DESCRIPTION_SIZE, COLS[1].width - 10 - TAG_SPACE);
    const b = balances[i];
    const tag: Tag | null = isVoid || b.amount <= 0 ? null : b.due <= 0 ? "PAID" : b.paid > 0 ? "PARTIAL" : "OPEN";
    return {
      date: shortDate(li.lineDate ?? invoice.issueDate),
      description,
      amount: money(b.amount),
      due: isVoid ? "—" : money(b.due),
      paid: money(b.paid),
      tag,
      height: Math.max(baseHeight, description.length * DESCRIPTION_LINE + 14),
    };
  });
  while (rows.length < MIN_ROWS) rows.push({ date: "", description: [], amount: "", due: "", paid: "", tag: null, height: baseHeight });

  // Payments received, oldest first, each with the line it went to.
  const descriptionById = new Map(invoice.lineItems.flatMap((li) => (li.id ? [[li.id, li.description] as const] : [])));
  const payments = (invoice.payments ?? [])
    .filter((p) => p.paidAt)
    .sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime());
  const paymentsHeight = payments.length
    ? SECTION_LABEL_HEIGHT + HEADER_HEIGHT + payments.length * PAY_ROW_HEIGHT + TOTAL_ROW_HEIGHT + 14
    : 0;

  // Under the table: the totals row with the balance box and due date
  // (kept together), the payments received, then the PAYMENT box and closing.
  const paymentText = invoice.sender?.paymentInstructions?.trim() || null;
  const footerText = invoice.footerText?.trim() || null;
  const totalsHeight = TOTAL_ROW_HEIGHT + BALANCE_ROW_HEIGHT + TOTAL_ROW_HEIGHT + 14;
  const closingBlockHeight = (paymentText ? infoBoxHeight(fonts, paymentText) + 18 : 0) + closingHeight(fonts, invoice.notes, footerText);
  // Blank filler rows give way before they'd push the rest onto a second page.
  const tableHeight = () => rows.reduce((sum, r) => sum + r.height, HEADER_HEIGHT);
  while (
    rows.length > invoice.lineItems.length &&
    billToBottom + tableHeight() + totalsHeight + paymentsHeight + closingBlockHeight > BOTTOM_LIMIT
  ) {
    rows.pop();
  }

  // Rows fill the page and continue under a repeated header on the next.
  let y = drawTableHeader(page, fonts, billToBottom, COLS, LINE_LABELS);
  for (const row of rows) {
    if (y + row.height > BOTTOM_LIMIT) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = drawTableHeader(page, fonts, 44, COLS, LINE_LABELS);
    }
    drawRow(page, fonts, y, row);
    y += row.height;
  }

  if (y + totalsHeight > BOTTOM_LIMIT) {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = 44;
  }
  box(page, { x: LEFT, top: y, width: RIGHT - LEFT, height: TOTAL_ROW_HEIGHT, fill: NAVY });
  textRight(page, "TOTAL", COLS[2].x - 6, y + 16, { size: 8.5, font: fonts.bold, color: WHITE });
  for (const [value, col] of [
    [money(total), COLS[2]],
    [isVoid ? "—" : money(balance), COLS[3]],
    [money(paidTotal), COLS[4]],
  ] as const) {
    drawFitted(page, value, { right: col.x + col.width - 4, y: yFromTop(y + 16), size: 10, font: fonts.bold, maxWidth: col.width - 8, color: WHITE });
  }
  y += TOTAL_ROW_HEIGHT;

  // The remaining balance, large, under the Amount Due / Amount Paid columns.
  const boxX = COLS[3].x;
  const boxWidth = RIGHT - boxX;
  box(page, { x: boxX, top: y, width: boxWidth, height: BALANCE_ROW_HEIGHT, fill: LIGHT_BLUE, border: GRID });
  text(page, "TOTAL AMOUNT DUE", boxX + 6, y + 20, { size: 7.5, font: fonts.bold, color: NAVY });
  const due = fitText(isVoid ? "VOID" : money(balance), fonts.bold, 15, boxWidth / 2 - 8, 8);
  textRight(page, due.text, RIGHT - 6, y + 22, { size: due.size, font: fonts.bold, color: isVoid ? GRAY : GOLD });
  y += BALANCE_ROW_HEIGHT;
  box(page, { x: boxX, top: y, width: boxWidth, height: TOTAL_ROW_HEIGHT, fill: CREAM, border: GRID });
  text(page, "Due Date:", boxX + 6, y + 16, { size: 8, font: fonts.font });
  textRight(page, shortDate(invoice.dueDate ?? invoice.issueDate), RIGHT - 6, y + 16, { size: 10, font: fonts.font });
  y += TOTAL_ROW_HEIGHT + 14;

  if (payments.length) {
    // The label and header stay with at least the first payment.
    if (y + SECTION_LABEL_HEIGHT + HEADER_HEIGHT + PAY_ROW_HEIGHT > BOTTOM_LIMIT) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = 44 - SECTION_LABEL_HEIGHT + 16;
    }
    text(page, "PAYMENTS RECEIVED", LEFT + 3, y + SECTION_LABEL_HEIGHT - 4, { size: 7, font: fonts.bold, color: STEEL });
    y = drawTableHeader(page, fonts, y + SECTION_LABEL_HEIGHT, PAY_COLS, PAY_LABELS);
    for (const p of payments) {
      if (y + PAY_ROW_HEIGHT > BOTTOM_LIMIT) {
        page = pdfDoc.addPage(PAGE_SIZE);
        y = drawTableHeader(page, fonts, 44, PAY_COLS, PAY_LABELS);
      }
      const applied = p.lineItemId ? descriptionById.get(p.lineItemId) ?? "" : "Whole invoice";
      drawPaymentRow(page, fonts, y, [shortDate(p.paidAt!), p.paymentMethod ?? "", p.reference ?? "", applied, money(p.amount)]);
      y += PAY_ROW_HEIGHT;
    }
    if (y + TOTAL_ROW_HEIGHT > BOTTOM_LIMIT) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = 44;
    }
    box(page, { x: LEFT, top: y, width: RIGHT - LEFT, height: TOTAL_ROW_HEIGHT, fill: LIGHT_BLUE, border: GRID });
    textRight(page, "Total received", PAY_COLS[4].x - 6, y + 16, { size: 8.5, font: fonts.bold, color: NAVY });
    const received = payments.reduce((sum, p) => sum + p.amount, 0);
    drawFitted(page, money(received), {
      right: RIGHT - 4,
      y: yFromTop(y + 16),
      size: 9.5,
      font: fonts.bold,
      maxWidth: PAY_COLS[4].width - 8,
      color: NAVY,
    });
    y += TOTAL_ROW_HEIGHT + 14;
  }

  if (y + closingBlockHeight > BOTTOM_LIMIT) {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = 44;
  }
  if (paymentText) {
    y = drawInfoBox(page, fonts, { top: y, label: "PAYMENT", body: paymentText }) + 18;
  }
  drawClosing(page, fonts, { top: y, notes: invoice.notes, footerText });

  drawPageFooters(pdfDoc, fonts, profileName, "Invoice");
  return pdfDoc.save();
}

/** Gold rule + navy header row. Returns the first row's top. */
function drawTableHeader(page: PDFPage, fonts: Fonts, top: number, cols: Col[], labels: string[]) {
  box(page, { x: LEFT, top, width: RIGHT - LEFT, height: HEADER_HEIGHT, fill: NAVY });
  hline(page, { x1: LEFT, x2: RIGHT, top, color: GOLD, thickness: 1.5 });
  cols.forEach((col, i) => {
    textCenter(page, labels[i], col.x, col.width, top + 18, { size: 7.5, font: fonts.bold, color: WHITE });
  });
  // Thin white dividers between header cells.
  for (const col of cols.slice(1)) {
    box(page, { x: col.x - 0.25, top: top + 1, width: 0.5, height: HEADER_HEIGHT - 1, fill: WHITE });
  }
  return top + HEADER_HEIGHT;
}

function drawRow(page: PDFPage, fonts: Fonts, top: number, row: Row) {
  COLS.forEach((col, i) => {
    box(page, { x: col.x, top, width: col.width, height: row.height, fill: i === 3 ? LIGHT_BLUE : CREAM, border: GRID });
  });
  const baseline = top + row.height / 2 + 3;
  if (row.date) text(page, row.date, COLS[0].x + 5, baseline, { size: 8.5, font: fonts.font });
  const firstBaseline = top + row.height / 2 + 3 - ((row.description.length || 1) - 1) * (DESCRIPTION_LINE / 2);
  row.description.forEach((line, i) =>
    text(page, line, COLS[1].x + 5, firstBaseline + i * DESCRIPTION_LINE, { size: DESCRIPTION_SIZE, font: fonts.font })
  );
  if (row.tag) drawTag(page, fonts, row.tag, COLS[1].x + COLS[1].width - 5, baseline);
  // Numbers shrink to fit their cell rather than spill into the next.
  for (const [value, col, font] of [
    [row.amount, COLS[2], fonts.font],
    [row.due, COLS[3], fonts.bold],
    [row.paid, COLS[4], fonts.font],
  ] as const) {
    if (!value) continue;
    drawFitted(page, value, { right: col.x + col.width - 4, y: yFromTop(baseline), size: DESCRIPTION_SIZE, font, maxWidth: col.width - 8 });
  }
}

/** A small colored pill (PAID / PARTIAL / OPEN), right edge at `right`. */
function drawTag(page: PDFPage, fonts: Fonts, tag: Tag, right: number, baseline: number) {
  const { label, fill, color } = TAGS[tag];
  const size = 6.5;
  const width = fonts.bold.widthOfTextAtSize(label, size) + 8;
  box(page, { x: right - width, top: baseline - 8, width, height: 11, fill });
  text(page, label, right - width + 4, baseline, { size, font: fonts.bold, color });
}

function drawPaymentRow(page: PDFPage, fonts: Fonts, top: number, values: string[]) {
  const baseline = top + PAY_ROW_HEIGHT / 2 + 3;
  PAY_COLS.forEach((col, i) => {
    box(page, { x: col.x, top, width: col.width, height: PAY_ROW_HEIGHT, fill: CREAM, border: GRID });
    if (!values[i]) return;
    if (i === PAY_COLS.length - 1) {
      drawFitted(page, values[i], { right: col.x + col.width - 4, y: yFromTop(baseline), size: 8.5, font: fonts.font, maxWidth: col.width - 8 });
    } else {
      const fitted = fitText(values[i], fonts.font, 8.5, col.width - 10, 6.5);
      text(page, fitted.text, col.x + 5, baseline, { size: fitted.size, font: fonts.font });
    }
  });
}
