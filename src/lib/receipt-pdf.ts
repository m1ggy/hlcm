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
import { PAGE_SIZE, MARGIN, drawWrappedText, drawLogoOrName, money, projectLabel } from "@/lib/invoice-pdf";
import { displayInvoiceNumber, displayReceiptNumber } from "@/lib/invoice-format";

export type ReceiptPdfInput = {
  seq: number;
  payment: {
    amount: number;
    paidAt: Date;
    paymentMethod: string;
  };
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
  };
  logo?: { bytes: Uint8Array; mimeType: string } | null;
  footerText?: string | null;
  profileName?: string | null;
};

export async function generateReceiptPdf(receipt: ReceiptPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  await drawLogoOrName(pdfDoc, page, { x: MARGIN, y, boldFont, logo: receipt.logo, profileName: receipt.profileName });
  page.drawText("RECEIPT", { x: PAGE_SIZE[0] - MARGIN - 100, y, size: 20, font: boldFont });
  y -= 20;
  page.drawText(displayReceiptNumber(receipt), {
    x: PAGE_SIZE[0] - MARGIN - 100,
    y,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 40;

  const project = projectLabel(receipt.client);
  if (project) {
    page.drawText(`Project: ${project}`, { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 16;
  }

  // Paid by
  const billTo = receipt.client.businessName ?? receipt.client.name;
  page.drawText("Received from", { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 14;
  page.drawText(billTo, { x: MARGIN, y, size: 12, font: boldFont });
  y -= 15;
  const addressLine = [
    receipt.client.billingAddressLine1,
    receipt.client.billingCity,
    receipt.client.billingState,
    receipt.client.billingPostalCode,
  ]
    .filter(Boolean)
    .join(", ");
  if (addressLine) {
    page.drawText(addressLine, { x: MARGIN, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 15;
  }

  // Date, right column
  const rightX = PAGE_SIZE[0] - MARGIN - 160;
  page.drawText(`Date: ${receipt.payment.paidAt.toLocaleDateString()}`, {
    x: rightX,
    y: PAGE_SIZE[1] - MARGIN - 60,
    size: 10,
    font,
  });

  y -= 30;
  page.drawLine({ start: { x: MARGIN, y: y + 10 }, end: { x: PAGE_SIZE[0] - MARGIN, y: y + 10 }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
  y -= 20;

  const number = displayInvoiceNumber(receipt.invoice);
  page.drawText(`Payment for Invoice ${number}`, { x: MARGIN, y, size: 11, font });
  y -= 16;
  page.drawText(`Payment method: ${receipt.payment.paymentMethod}`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 30;

  page.drawText("Amount received", { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(money(receipt.payment.amount), { x: PAGE_SIZE[0] - MARGIN - 90, y, size: 16, font: boldFont, color: rgb(0.1, 0.4, 0.2) });
  y -= 30;

  const total = receipt.invoice.total ?? 0;
  const paidToDate = receipt.invoice.amountPaid ?? 0;
  const remaining = total - paidToDate;
  page.drawText(`Invoice total: ${money(total)}`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 16;
  page.drawText(`Paid to date: ${money(paidToDate)}`, { x: MARGIN, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 16;
  page.drawText(
    remaining > 0 ? `Balance remaining: ${money(remaining)}` : "Paid in full",
    { x: MARGIN, y, size: 10, font: boldFont, color: rgb(0.1, 0.4, 0.2) }
  );
  y -= 40;

  // Org-wide boilerplate (see InvoiceProfile) — same footer the invoice PDF prints.
  if (receipt.footerText) {
    page.drawLine({ start: { x: MARGIN, y: y + 14 }, end: { x: PAGE_SIZE[0] - MARGIN, y: y + 14 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    drawWrappedText(page, receipt.footerText, {
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
