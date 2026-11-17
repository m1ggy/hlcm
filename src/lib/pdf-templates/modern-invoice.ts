// The Modern invoice layout — see ./modern-shared.ts for where it comes
// from. Same input as the Classic generateInvoicePdf (src/lib/invoice-pdf.ts),
// plus the profile's sender details. A running invoice: every line shows
// its amount, what's still due on it and what's been paid, and the total
// due is the remaining balance (see lineBalances).
import { currentOrganization } from "@/lib/db";
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { PAGE_SIZE, drawFitted, embedPdfFont, fitText, money, wrapText, type InvoicePdfInput } from "@/lib/invoice-pdf";
import { displayInvoiceNumber, lineBalances } from "@/lib/invoice-format";
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
  yFromTop,
  type Fonts,
} from "./modern-shared";

// Description / Amount / Amount Due / Amount Paid, left edges + widths.
const COLS = [
  { x: LEFT, width: 256 },
  { x: 300, width: 94 },
  { x: 394, width: 95 },
  { x: 489, width: RIGHT - 489 },
];
const BALANCE_ROW_HEIGHT = 34;
const HEADER_HEIGHT = 28;
const TOTAL_ROW_HEIGHT = 24;
// The sample always shows at least five rows, blank ones included.
const MIN_ROWS = 5;
const DESCRIPTION_SIZE = 9;
const DESCRIPTION_LINE = 11;

type Row = { description: string[]; amount: string; due: string; paid: string; height: number };

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
  const rows: Row[] = invoice.lineItems.map((li, i) => {
    // QTY isn't a column any more; a line billed by the hour (or any
    // quantity other than one) keeps that detail in its description.
    const label = li.quantity === 1 ? li.description : `${li.description} (${li.quantity} × ${money(li.unitPrice)})`;
    const description = wrapText(label, fonts.font, DESCRIPTION_SIZE, COLS[0].width - 10);
    return {
      description,
      amount: money(balances[i].amount),
      due: isVoid ? "—" : money(balances[i].due),
      paid: money(balances[i].paid),
      height: Math.max(baseHeight, description.length * DESCRIPTION_LINE + 14),
    };
  });
  while (rows.length < MIN_ROWS) rows.push({ description: [], amount: "", due: "", paid: "", height: baseHeight });

  // Totals row, the balance and due date, then the PAYMENT box and
  // closing — all together, on a fresh page if they don't fit under the table.
  const payment = invoice.sender?.paymentInstructions?.trim() || null;
  const footerText = invoice.footerText?.trim() || null;
  const footerHeight =
    TOTAL_ROW_HEIGHT * 2 + BALANCE_ROW_HEIGHT + 19 + (payment ? infoBoxHeight(fonts, payment) + 30 : 0) + closingHeight(fonts, invoice.notes, footerText);
  // Blank filler rows give way before they'd push all that onto a second page.
  const tableHeight = () => rows.reduce((sum, r) => sum + r.height, HEADER_HEIGHT);
  while (rows.length > invoice.lineItems.length && billToBottom + tableHeight() + footerHeight > BOTTOM_LIMIT) rows.pop();

  // Rows fill the page and continue under a repeated header on the next.
  let y = drawTableHeader(page, fonts, billToBottom);
  for (const row of rows) {
    if (y + row.height > BOTTOM_LIMIT) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = drawTableHeader(page, fonts, 44);
    }
    drawRow(page, fonts, y, row);
    y += row.height;
  }

  if (y + footerHeight > BOTTOM_LIMIT) {
    page = pdfDoc.addPage(PAGE_SIZE);
    y = 44;
  }

  box(page, { x: LEFT, top: y, width: RIGHT - LEFT, height: TOTAL_ROW_HEIGHT, fill: NAVY });
  textRight(page, "TOTAL", COLS[1].x - 6, y + 16, { size: 8.5, font: fonts.bold, color: WHITE });
  for (const [value, col] of [
    [money(total), COLS[1]],
    [isVoid ? "—" : money(balance), COLS[2]],
    [money(paidTotal), COLS[3]],
  ] as const) {
    drawFitted(page, value, { right: col.x + col.width - 4, y: yFromTop(y + 16), size: 10, font: fonts.bold, maxWidth: col.width - 8, color: WHITE });
  }
  y += TOTAL_ROW_HEIGHT;

  // The remaining balance, large, under the Amount Due / Amount Paid columns.
  const boxX = COLS[2].x;
  const boxWidth = RIGHT - boxX;
  box(page, { x: boxX, top: y, width: boxWidth, height: BALANCE_ROW_HEIGHT, fill: LIGHT_BLUE, border: GRID });
  text(page, "TOTAL AMOUNT DUE", boxX + 6, y + 20, { size: 7.5, font: fonts.bold, color: NAVY });
  const due = fitText(isVoid ? "VOID" : money(balance), fonts.bold, 15, boxWidth / 2 - 8, 8);
  textRight(page, due.text, RIGHT - 6, y + 22, { size: due.size, font: fonts.bold, color: isVoid ? GRAY : GOLD });
  y += BALANCE_ROW_HEIGHT;
  box(page, { x: boxX, top: y, width: boxWidth, height: TOTAL_ROW_HEIGHT, fill: CREAM, border: GRID });
  text(page, "Due Date:", boxX + 6, y + 16, { size: 8, font: fonts.font });
  textRight(page, shortDate(invoice.dueDate ?? invoice.issueDate), RIGHT - 6, y + 16, { size: 10, font: fonts.font });
  y += TOTAL_ROW_HEIGHT + 19;

  if (payment) {
    y = drawInfoBox(page, fonts, { top: y, label: "PAYMENT", body: payment }) + 30;
  }
  drawClosing(page, fonts, { top: y, notes: invoice.notes, footerText });

  drawPageFooters(pdfDoc, fonts, profileName, "Invoice");
  return pdfDoc.save();
}

/** Gold rule + navy header row. Returns the first row's top. */
function drawTableHeader(page: PDFPage, fonts: Fonts, top: number) {
  const labels = ["ITEM / DESCRIPTION", "AMOUNT", "AMOUNT DUE", "AMOUNT PAID"];
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
  COLS.forEach((col, i) => {
    box(page, { x: col.x, top, width: col.width, height: row.height, fill: i === 2 ? LIGHT_BLUE : CREAM, border: GRID });
  });
  const firstBaseline = top + row.height / 2 + 3 - ((row.description.length || 1) - 1) * (DESCRIPTION_LINE / 2);
  row.description.forEach((line, i) =>
    text(page, line, COLS[0].x + 5, firstBaseline + i * DESCRIPTION_LINE, { size: DESCRIPTION_SIZE, font: fonts.font })
  );
  // Numbers shrink to fit their cell rather than spill into the next.
  const baseline = top + row.height / 2 + 3;
  for (const [value, col, font] of [
    [row.amount, COLS[1], fonts.font],
    [row.due, COLS[2], fonts.bold],
    [row.paid, COLS[3], fonts.font],
  ] as const) {
    if (!value) continue;
    drawFitted(page, value, { right: col.x + col.width - 4, y: yFromTop(baseline), size: DESCRIPTION_SIZE, font, maxWidth: col.width - 8 });
  }
}
