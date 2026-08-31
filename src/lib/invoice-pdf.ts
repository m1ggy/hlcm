// Our own generated invoice PDF — the counterpart to Stripe's own PDF
// (invoicePdfUrl), which only ever exists for a Stripe-sent invoice. A
// manually-recorded invoice never touches Stripe, so it needs this to have
// a PDF at all: used by both the download route
// (src/app/api/invoices/[id]/pdf/route.ts) and the "Send invoice PDF"
// email action (sendManualInvoicePdf in src/lib/actions/invoices.ts), so
// the emailed copy and the downloaded copy are always identical.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { displayInvoiceNumber } from "@/lib/invoice-format";

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 48;

export type InvoicePdfInput = {
  seq: number;
  stripeInvoiceNumber: string | null;
  invoiceNumber: string | null;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  notes: string | null;
  total: number | null;
  taxAmount: number | null;
  amountPaid: number | null;
  paidAt: Date | null;
  client: {
    name: string;
    businessName: string | null;
    billingAddressLine1: string | null;
    billingCity: string | null;
    billingState: string | null;
    billingPostalCode: string | null;
  };
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  /** Org-wide branding from InvoiceSettings — see src/lib/invoice-settings.ts. */
  logo?: { bytes: Uint8Array; mimeType: string } | null;
  footerText?: string | null;
};

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export async function generateInvoicePdf(invoice: InvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  // A custom logo (see InvoiceSettings) replaces the plain "CTK" wordmark
  // when one's been uploaded; pdf-lib only embeds PNG/JPEG, which is all
  // the admin upload form accepts.
  if (invoice.logo) {
    const image =
      invoice.logo.mimeType === "image/png"
        ? await pdfDoc.embedPng(invoice.logo.bytes)
        : await pdfDoc.embedJpg(invoice.logo.bytes);
    const height = 56;
    const width = (image.width / image.height) * height;
    page.drawImage(image, { x: MARGIN, y: y - height + 14, width, height });
  } else {
    page.drawText("CTK", { x: MARGIN, y, size: 20, font: boldFont });
  }
  page.drawText("INVOICE", { x: PAGE_SIZE[0] - MARGIN - 90, y, size: 20, font: boldFont });
  y -= 20;
  page.drawText(displayInvoiceNumber(invoice), {
    x: PAGE_SIZE[0] - MARGIN - 90,
    y,
    size: 11,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 40;

  // Bill to
  const billTo = invoice.client.businessName ?? invoice.client.name;
  page.drawText("Bill to", { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 14;
  page.drawText(billTo, { x: MARGIN, y, size: 12, font: boldFont });
  y -= 15;
  const addressLine = [invoice.client.billingAddressLine1, invoice.client.billingCity, invoice.client.billingState, invoice.client.billingPostalCode]
    .filter(Boolean)
    .join(", ");
  if (addressLine) {
    page.drawText(addressLine, { x: MARGIN, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 15;
  }

  // Dates, right column
  let ry = PAGE_SIZE[1] - MARGIN - 60;
  const rightX = PAGE_SIZE[0] - MARGIN - 160;
  page.drawText(`Issued: ${invoice.issueDate.toLocaleDateString()}`, { x: rightX, y: ry, size: 10, font });
  ry -= 15;
  if (invoice.dueDate) {
    page.drawText(`Due: ${invoice.dueDate.toLocaleDateString()}`, { x: rightX, y: ry, size: 10, font });
    ry -= 15;
  }

  y -= 30;

  // Line items table — Description / Quantity / Amount. Unit price isn't a
  // separate column here (kept simple); it's still stored and used to
  // compute Amount, same convention already used when a line item is sent
  // to Stripe (see createInvoiceItem in src/lib/stripe.ts, which folds it
  // into the description text there too).
  const cols = [
    { label: "Description", x: MARGIN, width: 340 },
    { label: "Quantity", x: MARGIN + 340, width: 80 },
    { label: "Amount", x: MARGIN + 420, width: 90 },
  ];
  for (const col of cols) {
    page.drawText(col.label, { x: col.x, y, size: 10, font: boldFont });
  }
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_SIZE[0] - MARGIN, y },
    thickness: 0.75,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 18;

  for (const li of invoice.lineItems) {
    const amount = li.quantity * li.unitPrice;
    page.drawText(li.description, { x: cols[0].x, y, size: 10, font, maxWidth: cols[0].width - 10 });
    page.drawText(String(li.quantity), { x: cols[1].x, y, size: 10, font });
    page.drawText(money(amount), { x: cols[2].x, y, size: 10, font });
    y -= 20;
  }

  y -= 10;
  page.drawLine({
    start: { x: cols[1].x, y: y + 10 },
    end: { x: PAGE_SIZE[0] - MARGIN, y: y + 10 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  page.drawText("Subtotal", { x: cols[1].x, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(money(subtotal), { x: cols[2].x, y, size: 10, font });
  y -= 16;

  if (invoice.taxAmount) {
    page.drawText("Tax", { x: cols[1].x, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(money(invoice.taxAmount), { x: cols[2].x, y, size: 10, font });
    y -= 16;
  }

  page.drawText("Total", { x: cols[1].x, y, size: 11, font: boldFont });
  page.drawText(money(invoice.total ?? subtotal), { x: cols[2].x, y, size: 11, font: boldFont });
  y -= 30;

  // Payment status
  const total = invoice.total ?? subtotal;
  const paid = invoice.amountPaid ?? 0;
  let statusLine: string;
  if (invoice.status === "PAID") {
    statusLine = invoice.paidAt ? `Paid in full on ${invoice.paidAt.toLocaleDateString()}` : "Paid in full";
  } else if (invoice.status === "PARTIALLY_PAID") {
    statusLine = `Partially paid: ${money(paid)} of ${money(total)} received — ${money(total - paid)} remaining`;
  } else if (invoice.status === "VOID") {
    statusLine = "Void";
  } else {
    statusLine = `Amount due: ${money(total)}`;
  }
  page.drawText(statusLine, { x: MARGIN, y, size: 11, font: boldFont, color: rgb(0.1, 0.4, 0.2) });
  y -= 30;

  if (invoice.notes) {
    page.drawText("Notes", { x: MARGIN, y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    y -= 14;
    page.drawText(invoice.notes, { x: MARGIN, y, size: 10, font, maxWidth: PAGE_SIZE[0] - MARGIN * 2 });
    y -= 40;
  }

  // Org-wide boilerplate (see InvoiceSettings) — always last, distinct from
  // the invoice's own notes above.
  if (invoice.footerText) {
    page.drawLine({
      start: { x: MARGIN, y: y + 14 },
      end: { x: PAGE_SIZE[0] - MARGIN, y: y + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    page.drawText(invoice.footerText, {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: rgb(0.55, 0.55, 0.55),
      maxWidth: PAGE_SIZE[0] - MARGIN * 2,
      lineHeight: 11,
    });
  }

  return pdfDoc.save();
}
