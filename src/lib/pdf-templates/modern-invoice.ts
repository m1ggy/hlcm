// The Modern invoice layout — see ./modern-shared.ts for where it comes
// from. Same input as the Classic generateInvoicePdf (src/lib/invoice-pdf.ts),
// plus the profile's sender details and quantity-column heading.
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { PAGE_SIZE, money, wrapText, type InvoicePdfInput } from "@/lib/invoice-pdf";
import { displayInvoiceNumber } from "@/lib/invoice-format";
import { QUANTITY_LABELS } from "./options";
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
  type Fonts,
} from "./modern-shared";

// Description / Hours / Rate / Amount / Amount Due, left edges + widths.
const COLS = [
  { x: LEFT, width: 162 },
  { x: 206, width: 85 },
  { x: 291, width: 83 },
  { x: 374, width: 100 },
  { x: 474, width: RIGHT - 474 },
];
const HEADER_HEIGHT = 28;
const TOTAL_ROW_HEIGHT = 24;
// The sample always shows at least five rows, blank ones included.
const MIN_ROWS = 5;
const DESCRIPTION_SIZE = 9;
const DESCRIPTION_LINE = 11;

type Row = { description: string[]; hours: string; rate: string; amount: string; height: number };

export async function generateModernInvoicePdf(invoice: InvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts: Fonts = {
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const profileName = invoice.profileName ?? "CTK";
  const quantityLabel = QUANTITY_LABELS[invoice.quantityLabel ?? "HOURS"];

  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const total = invoice.total ?? subtotal;
  const balance = Math.max(0, total - (invoice.amountPaid ?? 0));
  const amountDue = invoice.status === "VOID" ? "VOID" : money(balance);

  let page = pdfDoc.addPage(PAGE_SIZE);
  const ruleTop = await drawModernHeader(pdfDoc, page, fonts, {
    title: "INVOICE",
    meta: [
      { label: "Invoice #:", value: displayInvoiceNumber(invoice) },
      { label: "Date:", value: shortDate(invoice.issueDate) },
      { label: "Due:", value: invoice.dueDate ? shortDate(invoice.dueDate) : "Upon receipt" },
    ],
    logo: invoice.logo,
    profileName,
    sender: invoice.sender ?? null,
  });

  // Bill To — a Care Recipient invoice addresses the actual payer, same
  // as the Classic layout (though those normally render through
  // generateCareRecipientInvoicePdf instead).
  const recipient = invoice.careRecipient;
  const address = recipient
    ? recipient.address ?? ""
    : [invoice.client.billingAddressLine1, invoice.client.billingCity, invoice.client.billingState, invoice.client.billingPostalCode]
        .filter(Boolean)
        .join(", ");
  const billToBottom = drawPartyBox(page, fonts, {
    top: ruleTop + 46,
    label: "BILL TO",
    lines: [
      {
        label: "Client / Company Name:  ",
        value: (recipient ? recipient.billingContactName || recipient.name : invoice.client.businessName ?? invoice.client.name).toUpperCase(),
      },
      { label: "Attn: ", value: recipient ? (recipient.billingContactName ? recipient.name : "") : invoice.client.owners?.[0]?.name ?? "" },
      { label: "Address / City / State: ", value: address },
    ],
  });

  const baseHeight = invoice.lineItems.length <= MIN_ROWS ? 33.5 : 24;
  const rows: Row[] = invoice.lineItems.map((li) => {
    const description = wrapText(li.description, fonts.font, DESCRIPTION_SIZE, COLS[0].width - 10);
    return {
      description,
      hours: String(li.quantity),
      rate: money(li.unitPrice),
      amount: money(li.quantity * li.unitPrice),
      height: Math.max(baseHeight, description.length * DESCRIPTION_LINE + 14),
    };
  });
  while (rows.length < MIN_ROWS) rows.push({ description: [], hours: "", rate: "", amount: "", height: baseHeight });

  // Rows fill the page and continue under a repeated header on the next;
  // the Amount Due column is one merged cell per page.
  let tableTop = billToBottom;
  let y = drawTableHeader(page, fonts, tableTop, quantityLabel);
  let segmentTop = y;
  for (const row of rows) {
    if (y + row.height > BOTTOM_LIMIT) {
      drawAmountDueCell(page, fonts, segmentTop, y, amountDue);
      page = pdfDoc.addPage(PAGE_SIZE);
      tableTop = 44;
      y = drawTableHeader(page, fonts, tableTop, quantityLabel);
      segmentTop = y;
    }
    drawRow(page, fonts, y, row);
    y += row.height;
  }
  drawAmountDueCell(page, fonts, segmentTop, y, amountDue);

  // Total row + Due Date, then the PAYMENT box and closing — all together,
  // on a fresh page if they don't fit under the table.
  const payment = invoice.sender?.paymentInstructions?.trim() || null;
  const footerText = invoice.footerText?.trim() || null;
  const beforeClosing = TOTAL_ROW_HEIGHT * 2 + 19 + (payment ? infoBoxHeight(fonts, payment) + 30 : 0);
  if (y + beforeClosing + closingHeight(fonts, invoice.notes, footerText) > BOTTOM_LIMIT) {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = 44;
  }

  box(page, { x: LEFT, top: y, width: COLS[4].x - LEFT, height: TOTAL_ROW_HEIGHT, fill: NAVY });
  textRight(page, "TOTAL", COLS[3].x - 2, y + 16, { size: 8.5, font: fonts.bold, color: WHITE });
  textRight(page, money(total), COLS[3].x + COLS[3].width - 4, y + 16, { size: 10, font: fonts.bold, color: WHITE });
  box(page, { x: COLS[4].x, top: y, width: COLS[4].width, height: TOTAL_ROW_HEIGHT, border: GRID });
  textCenter(page, "Due Date:", COLS[4].x, COLS[4].width, y + 15, { size: 8, font: fonts.font });
  y += TOTAL_ROW_HEIGHT;
  box(page, { x: COLS[4].x, top: y, width: COLS[4].width, height: TOTAL_ROW_HEIGHT, fill: CREAM, border: GRID });
  textCenter(page, shortDate(invoice.dueDate ?? invoice.issueDate), COLS[4].x, COLS[4].width, y + 16, { size: 10, font: fonts.font });
  y += TOTAL_ROW_HEIGHT + 19;

  if (payment) {
    y = drawInfoBox(page, fonts, { top: y, label: "PAYMENT", body: payment }) + 30;
  }
  drawClosing(page, fonts, { top: y, notes: invoice.notes, footerText });

  drawPageFooters(pdfDoc, fonts, profileName, "Invoice");
  return pdfDoc.save();
}

/** Gold rule + navy header row. Returns the first row's top. */
function drawTableHeader(page: PDFPage, fonts: Fonts, top: number, quantityLabel: string) {
  const labels = ["ITEM / DESCRIPTION", quantityLabel.toUpperCase(), "RATE", "AMOUNT", "AMOUNT DUE"];
  box(page, { x: LEFT, top, width: RIGHT - LEFT, height: HEADER_HEIGHT, fill: NAVY });
  hline(page, { x1: LEFT, x2: RIGHT, top, color: GOLD, thickness: 1.5 });
  COLS.forEach((col, i) => {
    textCenter(page, labels[i], col.x, col.width, top + 18, { size: 7.5, font: fonts.bold, color: WHITE });
  });
  // Thin white dividers between header cells.
  for (const col of COLS.slice(1)) {
    box(page, { x: col.x - 0.25, top: top + 1, width: 0.5, height: HEADER_HEIGHT - 1, fill: WHITE });
  }
  return top + HEADER_HEIGHT;
}

function drawRow(page: PDFPage, fonts: Fonts, top: number, row: Row) {
  for (const col of COLS.slice(0, 4)) {
    box(page, { x: col.x, top, width: col.width, height: row.height, fill: CREAM, border: GRID });
  }
  const firstBaseline = top + row.height / 2 + 3 - ((row.description.length || 1) - 1) * (DESCRIPTION_LINE / 2);
  row.description.forEach((line, i) =>
    text(page, line, COLS[0].x + 5, firstBaseline + i * DESCRIPTION_LINE, { size: DESCRIPTION_SIZE, font: fonts.font })
  );
  const baseline = top + row.height / 2 + 3;
  if (row.hours) textCenter(page, row.hours, COLS[1].x, COLS[1].width, baseline, { size: DESCRIPTION_SIZE, font: fonts.font });
  if (row.rate) textRight(page, row.rate, COLS[2].x + COLS[2].width - 4, baseline, { size: DESCRIPTION_SIZE, font: fonts.font });
  if (row.amount) textRight(page, row.amount, COLS[3].x + COLS[3].width - 4, baseline, { size: DESCRIPTION_SIZE, font: fonts.font });
}

function drawAmountDueCell(page: PDFPage, fonts: Fonts, top: number, bottom: number, amountDue: string) {
  box(page, { x: COLS[4].x, top, width: COLS[4].width, height: bottom - top, fill: LIGHT_BLUE, border: GRID });
  const isVoid = amountDue === "VOID";
  textCenter(page, amountDue, COLS[4].x, COLS[4].width, (top + bottom) / 2 + 6, {
    size: 17,
    font: fonts.bold,
    color: isVoid ? GRAY : GOLD,
  });
}
