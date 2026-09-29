// A short, one-page PDF documenting a single Payment — the counterpart to
// invoice-pdf.ts's generateInvoicePdf, sharing its page geometry and
// hand-wrapping helpers (a receipt just has much less to lay out: one
// payment, not a line-item table). Used by both the download route
// (src/app/api/receipts/[id]/pdf/route.ts) and sendReceiptEmail (see
// src/lib/actions/invoices.ts), so the emailed copy and the downloaded
// copy are always identical. Generated once, at the moment addManualPayment
// records the payment — never regenerated afterward, so a receipt's bytes
// stay fixed even if the invoice is edited later.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  PAGE_SIZE,
  MARGIN,
  PageCursor,
  drawFitted,
  drawLogoOrName,
  drawWrappedTextPaged,
  money,
  projectLabel,
} from "@/lib/invoice-pdf";
import { displayInvoiceNumber, displayReceiptNumber, formatCalendarDate } from "@/lib/invoice-format";
import type { SenderDetails } from "@/lib/pdf-templates/options";

export type ReceiptPdfInput = {
  seq: number;
  payment: {
    amount: number;
    paidAt: Date;
    paymentMethod: string;
  };
  /** The line item this payment was recorded against, if any — see
   * Payment.lineItemId in prisma/schema.prisma. */
  lineItemDescription?: string | null;
  invoice: {
    seq: number;
    stripeInvoiceNumber: string | null;
    invoiceNumber: string | null;
    total: number | null;
    amountPaid: number | null;
  };
  client: {
    name: string;
    businessName: string | null;
    billingAddressLine1: string | null;
    billingCity: string | null;
    billingState: string | null;
    billingPostalCode: string | null;
    projects: { name: string }[];
    /** First owner — printed as "Attn:" by the Modern layout. */
    owners?: { name: string }[];
  };
  logo?: { bytes: Uint8Array; mimeType: string } | null;
  footerText?: string | null;
  profileName?: string | null;
  /** The profile's address/phone/email (Modern layout only). */
  sender?: SenderDetails | null;
};

export async function generateReceiptPdf(receipt: ReceiptPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cursor = new PageCursor(pdfDoc);
  const page = cursor.page;
  const right = PAGE_SIZE[0] - MARGIN;
  const fullWidth = right - MARGIN;
  // The left column stops short of the date on the right.
  const rightX = right - 160;
  const leftWidth = rightX - MARGIN - 12;
  const gray = rgb(0.4, 0.4, 0.4);

  await drawLogoOrName(pdfDoc, page, {
    x: MARGIN,
    y: cursor.y,
    boldFont,
    logo: receipt.logo,
    profileName: receipt.profileName,
    maxWidth: right - 120 - MARGIN,
  });
  page.drawText("RECEIPT", { x: right - boldFont.widthOfTextAtSize("RECEIPT", 20), y: cursor.y, size: 20, font: boldFont });
  drawFitted(page, displayReceiptNumber(receipt), { right, y: cursor.y - 20, size: 11, minSize: 7, maxWidth: 220, font, color: gray });

  // Date, right column
  page.drawText(`Date: ${formatCalendarDate(receipt.payment.paidAt)}`, { x: rightX, y: PAGE_SIZE[1] - MARGIN - 60, size: 10, font });

  cursor.y -= 60;
  const project = projectLabel(receipt.client);
  if (project) {
    drawWrappedTextPaged(cursor, `Project: ${project}`, {
      x: MARGIN,
      font,
      size: 9,
      maxWidth: leftWidth,
      lineHeight: 12,
      color: rgb(0.5, 0.5, 0.5),
    });
    cursor.y -= 4;
  }

  // Paid by
  page.drawText("Received from", { x: MARGIN, y: cursor.y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  cursor.y -= 14;
  drawWrappedTextPaged(cursor, receipt.client.businessName ?? receipt.client.name, {
    x: MARGIN,
    font: boldFont,
    size: 12,
    maxWidth: leftWidth,
    lineHeight: 15,
  });
  const addressLine = [
    receipt.client.billingAddressLine1,
    receipt.client.billingCity,
    receipt.client.billingState,
    receipt.client.billingPostalCode,
  ]
    .filter(Boolean)
    .join(", ");
  if (addressLine) {
    drawWrappedTextPaged(cursor, addressLine, { x: MARGIN, font, size: 10, maxWidth: leftWidth, lineHeight: 14, color: rgb(0.3, 0.3, 0.3) });
  }

  cursor.y -= 16;
  cursor.page.drawLine({ start: { x: MARGIN, y: cursor.y + 10 }, end: { x: right, y: cursor.y + 10 }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
  cursor.y -= 20;

  drawWrappedTextPaged(cursor, `Payment for Invoice ${displayInvoiceNumber(receipt.invoice)}`, {
    x: MARGIN,
    font,
    size: 11,
    maxWidth: fullWidth,
    lineHeight: 15,
  });
  drawWrappedTextPaged(cursor, `Payment method: ${receipt.payment.paymentMethod}`, {
    x: MARGIN,
    font,
    size: 10,
    maxWidth: fullWidth,
    lineHeight: 14,
    color: gray,
  });
  if (receipt.lineItemDescription) {
    drawWrappedTextPaged(cursor, `Applied to: ${receipt.lineItemDescription}`, {
      x: MARGIN,
      font,
      size: 10,
      maxWidth: fullWidth,
      lineHeight: 14,
      color: gray,
    });
  }
  cursor.y -= 16;

  cursor.ensure(100);
  cursor.page.drawText("Amount received", { x: MARGIN, y: cursor.y, size: 10, font, color: gray });
  drawFitted(cursor.page, money(receipt.payment.amount), {
    right,
    y: cursor.y,
    size: 16,
    minSize: 9,
    maxWidth: fullWidth - 120,
    font: boldFont,
    color: rgb(0.1, 0.4, 0.2),
  });
  cursor.y -= 30;

  const total = receipt.invoice.total ?? 0;
  const paidToDate = receipt.invoice.amountPaid ?? 0;
  const remaining = total - paidToDate;
  for (const line of [`Invoice total: ${money(total)}`, `Paid to date: ${money(paidToDate)}`]) {
    drawWrappedTextPaged(cursor, line, { x: MARGIN, font, size: 10, maxWidth: fullWidth, lineHeight: 16, color: gray });
  }
  drawWrappedTextPaged(cursor, remaining > 0 ? `Balance remaining: ${money(remaining)}` : "Paid in full", {
    x: MARGIN,
    font: boldFont,
    size: 10,
    maxWidth: fullWidth,
    lineHeight: 16,
    color: rgb(0.1, 0.4, 0.2),
  });
  cursor.y -= 24;

  // Org-wide boilerplate (see InvoiceProfile) — same footer the invoice PDF prints.
  if (receipt.footerText) {
    cursor.ensure(24);
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y + 14 },
      end: { x: right, y: cursor.y + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    drawWrappedTextPaged(cursor, receipt.footerText, {
      x: MARGIN,
      font,
      size: 8,
      color: rgb(0.55, 0.55, 0.55),
      maxWidth: fullWidth,
      lineHeight: 11,
    });
  }

  return pdfDoc.save();
}
