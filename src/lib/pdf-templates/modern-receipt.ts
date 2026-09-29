// The Modern receipt layout — the same boxed look as the Modern invoice
// (./modern-invoice.ts), for one Payment. Same input as the Classic
// generateReceiptPdf (src/lib/receipt-pdf.ts).
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PAGE_SIZE, money, wrapText } from "@/lib/invoice-pdf";
import { displayInvoiceNumber, displayReceiptNumber } from "@/lib/invoice-format";
import type { ReceiptPdfInput } from "@/lib/receipt-pdf";
import {
  CREAM,
  GOLD,
  GRID,
  LEFT,
  LIGHT_BLUE,
  NAVY,
  RIGHT,
  WHITE,
  box,
  drawClosing,
  drawModernHeader,
  drawPageFooters,
  drawPartyBox,
  hline,
  shortDate,
  text,
  textCenter,
  textRight,
  type Fonts,
} from "./modern-shared";

// Description / Method / Amount.
const COLS = [
  { x: LEFT, width: 330 },
  { x: 374, width: 100 },
  { x: 474, width: RIGHT - 474 },
];

export async function generateModernReceiptPdf(receipt: ReceiptPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fonts: Fonts = {
    font: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
  const page = pdfDoc.addPage(PAGE_SIZE);
  const profileName = receipt.profileName ?? "CTK";
  const invoiceNumber = displayInvoiceNumber(receipt.invoice);

  const ruleTop = await drawModernHeader(pdfDoc, page, fonts, {
    title: "RECEIPT",
    meta: [
      { label: "Receipt #:", value: displayReceiptNumber(receipt) },
      { label: "Date:", value: shortDate(receipt.payment.paidAt) },
      { label: "Invoice #:", value: invoiceNumber },
    ],
    logo: receipt.logo,
    profileName,
    sender: receipt.sender ?? null,
  });

  const client = receipt.client;
  const tableTop = drawPartyBox(page, fonts, {
    top: ruleTop + 46,
    label: "RECEIVED FROM",
    lines: [
      { label: "Client / Company Name:  ", value: (client.businessName ?? client.name).toUpperCase() },
      { label: "Attn: ", value: client.owners?.[0]?.name ?? "" },
      {
        label: "Address / City / State: ",
        value: [client.billingAddressLine1, client.billingCity, client.billingState, client.billingPostalCode].filter(Boolean).join(", "),
      },
    ],
  });

  // Header row
  const labels = ["DESCRIPTION", "METHOD", "AMOUNT"];
  box(page, { x: LEFT, top: tableTop, width: RIGHT - LEFT, height: 28, fill: NAVY });
  hline(page, { x1: LEFT, x2: RIGHT, top: tableTop, color: GOLD, thickness: 1.5 });
  COLS.forEach((col, i) => textCenter(page, labels[i], col.x, col.width, tableTop + 18, { size: 7.5, font: fonts.bold, color: WHITE }));
  for (const col of COLS.slice(1)) box(page, { x: col.x - 0.25, top: tableTop + 1, width: 0.5, height: 27, fill: WHITE });

  // The one payment row
  const description = [
    `Payment for Invoice ${invoiceNumber}`,
    ...(receipt.lineItemDescription
      ? wrapText(`Applied to: ${receipt.lineItemDescription}`, fonts.font, 8.5, COLS[0].width - 10)
      : []),
  ];
  const rowTop = tableTop + 28;
  const rowHeight = Math.max(40, description.length * 12 + 18);
  for (const col of COLS) box(page, { x: col.x, top: rowTop, width: col.width, height: rowHeight, fill: CREAM, border: GRID });
  const firstBaseline = rowTop + rowHeight / 2 + 3 - (description.length - 1) * 6;
  description.forEach((line, i) =>
    text(page, line, COLS[0].x + 5, firstBaseline + i * 12, { size: i === 0 ? 9 : 8.5, font: fonts.font })
  );
  const baseline = rowTop + rowHeight / 2 + 3;
  textCenter(page, receipt.payment.paymentMethod, COLS[1].x, COLS[1].width, baseline, { size: 9, font: fonts.font });
  textRight(page, money(receipt.payment.amount), COLS[2].x + COLS[2].width - 4, baseline, { size: 9, font: fonts.bold });

  // Summary: invoice total / paid to date, then the balance in the
  // light-blue box — gold while something's still owed.
  const total = receipt.invoice.total ?? 0;
  const paidToDate = receipt.invoice.amountPaid ?? 0;
  const remaining = total - paidToDate;
  let y = rowTop + rowHeight;
  for (const [label, value] of [
    ["Invoice total", money(total)],
    ["Paid to date", money(paidToDate)],
  ]) {
    box(page, { x: COLS[1].x, top: y, width: COLS[1].width, height: 24, border: GRID });
    box(page, { x: COLS[2].x, top: y, width: COLS[2].width, height: 24, border: GRID });
    textCenter(page, label, COLS[1].x, COLS[1].width, y + 15, { size: 8, font: fonts.font });
    textRight(page, value, COLS[2].x + COLS[2].width - 4, y + 15, { size: 9, font: fonts.font });
    y += 24;
  }
  box(page, { x: COLS[1].x, top: y, width: RIGHT - COLS[1].x, height: 44, fill: LIGHT_BLUE, border: GRID });
  textCenter(page, remaining > 0 ? "Balance remaining" : "Paid in full", COLS[1].x, COLS[1].width, y + 26, { size: 8, font: fonts.bold });
  textCenter(page, money(Math.max(0, remaining)), COLS[2].x, COLS[2].width, y + 29, { size: 15, font: fonts.bold, color: GOLD });
  y += 44 + 40;

  drawClosing(page, fonts, { top: y, notes: false, footerText: receipt.footerText?.trim() || null });
  drawPageFooters(pdfDoc, fonts, profileName, "Receipt");
  return pdfDoc.save();
}
