// Our own generated invoice PDF — the counterpart to Stripe's own PDF
// (invoicePdfUrl), which only ever exists for a Stripe-sent invoice. A
// manually-recorded invoice never touches Stripe, so it needs this to have
// a PDF at all: used by both the download route
// (src/app/api/invoices/[id]/pdf/route.ts) and the "Send invoice PDF"
// email action (sendManualInvoicePdf in src/lib/actions/invoices.ts), so
// the emailed copy and the downloaded copy are always identical.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { displayInvoiceNumber, formatCalendarDate } from "@/lib/invoice-format";
import { isManual } from "@/lib/invoice-shared";
import { QUANTITY_LABELS, type QuantityLabelId, type SenderDetails } from "@/lib/pdf-templates/options";

// Exported for receipt-pdf.ts to share — a receipt uses the same page
// geometry and hand-wrapping helpers, just a much shorter layout.
export const PAGE_SIZE: [number, number] = [612, 792];
export const MARGIN = 48;

// pdf-lib's own `maxWidth` option wraps long text for you, but never tells
// you how many lines that produced — every call site here used to advance
// `y` by a fixed guess afterward, which was wrong (and silently
// overlapping the next section) as soon as a note or footer was long
// enough to wrap onto more lines than the guess assumed. Wrapping by hand
// means the actual line count — and so the actual height consumed — is
// always known.
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // A single word wider than the whole line (a URL, a long reference
      // number) is split across lines rather than left to run past the edge.
      current = "";
      for (const char of word) {
        if (current && font.widthOfTextAtSize(current + char, size) > maxWidth) {
          lines.push(current);
          current = char;
        } else {
          current += char;
        }
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * For one-line slots (an amount, an invoice number, a header name): the
 * largest size between `size` and `minSize` at which `text` fits in
 * `maxWidth`, truncated with "…" only if it still doesn't fit at `minSize`.
 */
export function fitText(text: string, font: PDFFont, size: number, maxWidth: number, minSize = 6): { text: string; size: number } {
  let fitted = size;
  while (fitted > minSize && font.widthOfTextAtSize(text, fitted) > maxWidth) fitted -= 0.5;
  if (font.widthOfTextAtSize(text, fitted) <= maxWidth) return { text, size: fitted };
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, fitted) > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size: fitted };
}

/** Draws `text` shrunk/truncated to fit `maxWidth` (see fitText), left-aligned at x or right-aligned to `right`. */
export function drawFitted(
  page: PDFPage,
  text: string,
  opts: { x?: number; right?: number; y: number; font: PDFFont; size: number; maxWidth: number; minSize?: number; color?: ReturnType<typeof rgb> }
) {
  const fitted = fitText(text, opts.font, opts.size, opts.maxWidth, opts.minSize);
  const x = opts.right != null ? opts.right - opts.font.widthOfTextAtSize(fitted.text, fitted.size) : opts.x ?? 0;
  page.drawText(fitted.text, { x, y: opts.y, size: fitted.size, font: opts.font, color: opts.color });
}

/**
 * Top-down drawing position that moves onto a fresh page when the next
 * block wouldn't fit above the bottom margin — the Classic and Care
 * Recipient layouts draw everything through one of these, so a long
 * invoice continues on page 2 instead of running off the bottom.
 */
export class PageCursor {
  page: PDFPage;
  y: number;
  constructor(private pdfDoc: PDFDocument, page?: PDFPage) {
    this.page = page ?? pdfDoc.addPage(PAGE_SIZE);
    this.y = PAGE_SIZE[1] - MARGIN;
  }
  /** Starts a new page if fewer than `height` points are left; true if it did. */
  ensure(height: number): boolean {
    if (this.y - height >= MARGIN) return false;
    this.page = this.pdfDoc.addPage(PAGE_SIZE);
    this.y = PAGE_SIZE[1] - MARGIN;
    return true;
  }
}

/** drawWrappedText through a PageCursor, one line at a time, so a long
 * block of notes/footer text breaks across pages. */
export function drawWrappedTextPaged(
  cursor: PageCursor,
  text: string,
  opts: { x: number; font: PDFFont; size: number; maxWidth: number; lineHeight: number; color?: ReturnType<typeof rgb> }
) {
  for (const line of wrapText(text, opts.font, opts.size, opts.maxWidth)) {
    cursor.ensure(opts.lineHeight);
    cursor.page.drawText(line, { x: opts.x, y: cursor.y, size: opts.size, font: opts.font, color: opts.color });
    cursor.y -= opts.lineHeight;
  }
}

// Draws hand-wrapped text top-down from `y` and returns the total height
// consumed, so the caller can advance `y` by the real amount rather than a
// fixed guess.
export function drawWrappedText(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; font: PDFFont; size: number; maxWidth: number; lineHeight: number; color?: ReturnType<typeof rgb> }
): number {
  const lines = wrapText(text, opts.font, opts.size, opts.maxWidth);
  let cursorY = opts.y;
  for (const line of lines) {
    page.drawText(line, { x: opts.x, y: cursorY, size: opts.size, font: opts.font, color: opts.color });
    cursorY -= opts.lineHeight;
  }
  return lines.length * opts.lineHeight;
}

export type InvoicePdfInput = {
  seq: number;
  stripeInvoiceNumber: string | null;
  invoiceNumber: string | null;
  status: string;
  stripeInvoiceId: string | null;
  issueDate: Date;
  dueDate: Date | null;
  /** The service period this invoice covers — Care Recipient invoices only
   * (see generateCareRecipientInvoicePdf); staff-entered, never derived. */
  periodStart: Date | null;
  periodEnd: Date | null;
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
    projects: { name: string }[];
    /** First owner — printed as "Attn:" by the Modern layout. */
    owners?: { name: string }[];
  };
  /** Manual invoices only — who this bills for, if a Care Recipient (see
   * Invoice.careRecipientId). When set, the Bill To block addresses the
   * actual payer instead of the agency. */
  careRecipient?: {
    name: string;
    address: string | null;
    billingContactName: string | null;
  } | null;
  lineItems: { description: string; quantity: number; unitPrice: number }[];
  /** Which InvoiceProfile this invoice was billed under — see src/lib/invoice-profiles.ts. */
  logo?: { bytes: Uint8Array; mimeType: string } | null;
  footerText?: string | null;
  /** Printed where the logo would go when there isn't one. Falls back to "CTK". */
  profileName?: string | null;
  /** The profile's address/phone/email/payment instructions (Modern layout only). */
  sender?: SenderDetails | null;
  /** The profile's heading for the quantity column; unset keeps the old
   * Hours (manual) / Quantity (Stripe-bound) default. */
  quantityLabel?: QuantityLabelId | null;
};

export function money(n: number) {
  return `$${n.toFixed(2)}`;
}

/** "Acme Home Care" (joined, a client is occasionally in more than one
 * Project) or null when the client isn't in any — shared by the invoice
 * and receipt PDFs so a printed document always shows which project it's
 * for, same as the Project column on the Invoices table. */
export function projectLabel(client: { projects: { name: string }[] }): string | null {
  return client.projects.length > 0 ? client.projects.map((p) => p.name).join(", ") : null;
}

/** Draws the org's logo (see InvoiceProfile) at (x, y) sized to `height`,
 * or the profile's plain name as a bold wordmark when there isn't one —
 * shared by both the invoice and receipt PDF headers. pdf-lib only embeds
 * PNG/JPEG, which is all the admin upload form accepts. */
export async function drawLogoOrName(
  pdfDoc: PDFDocument,
  page: PDFPage,
  opts: {
    x: number;
    y: number;
    boldFont: PDFFont;
    logo?: { bytes: Uint8Array; mimeType: string } | null;
    profileName?: string | null;
    height?: number;
    /** Room before whatever sits to the right (the INVOICE/RECEIPT title). */
    maxWidth?: number;
  }
) {
  const maxWidth = opts.maxWidth ?? 300;
  if (opts.logo) {
    const image =
      opts.logo.mimeType === "image/png" ? await pdfDoc.embedPng(opts.logo.bytes) : await pdfDoc.embedJpg(opts.logo.bytes);
    // Scaled to the target height, then down again if that's too wide.
    const height = Math.min(opts.height ?? 56, (image.height / image.width) * maxWidth);
    const width = (image.width / image.height) * height;
    page.drawImage(image, { x: opts.x, y: opts.y - height + 14, width, height });
  } else {
    drawFitted(page, opts.profileName ?? "CTK", { x: opts.x, y: opts.y, font: opts.boldFont, size: 20, minSize: 11, maxWidth });
  }
}

export async function generateInvoicePdf(invoice: InvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cursor = new PageCursor(pdfDoc);
  const page = cursor.page;
  const right = PAGE_SIZE[0] - MARGIN;
  // The left column stops short of the dates on the right.
  const rightX = right - 160;
  const leftWidth = rightX - MARGIN - 12;

  await drawLogoOrName(pdfDoc, page, {
    x: MARGIN,
    y: cursor.y,
    boldFont,
    logo: invoice.logo,
    profileName: invoice.profileName,
    maxWidth: right - 110 - MARGIN,
  });
  page.drawText("INVOICE", { x: right - boldFont.widthOfTextAtSize("INVOICE", 20), y: cursor.y, size: 20, font: boldFont });
  drawFitted(page, displayInvoiceNumber(invoice), {
    right,
    y: cursor.y - 20,
    size: 11,
    minSize: 7,
    maxWidth: 220,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Dates, right column
  let ry = PAGE_SIZE[1] - MARGIN - 60;
  page.drawText(`Issued: ${formatCalendarDate(invoice.issueDate)}`, { x: rightX, y: ry, size: 10, font });
  ry -= 15;
  if (invoice.dueDate) {
    page.drawText(`Due: ${formatCalendarDate(invoice.dueDate)}`, { x: rightX, y: ry, size: 10, font });
    ry -= 15;
  }

  cursor.y -= 60;
  const project = projectLabel(invoice.client);
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

  // Bill to — a Care Recipient invoice addresses the actual payer (their
  // billing contact if one's on file, else the recipient themselves)
  // instead of the licensing agency, since the point of tagging a
  // recipient at all is billing the person who receives/pays for care.
  const recipient = invoice.careRecipient;
  const billTo = recipient ? recipient.billingContactName || recipient.name : invoice.client.businessName ?? invoice.client.name;
  page.drawText("Bill to", { x: MARGIN, y: cursor.y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  cursor.y -= 14;
  drawWrappedTextPaged(cursor, billTo, { x: MARGIN, font: boldFont, size: 12, maxWidth: leftWidth, lineHeight: 15 });
  if (recipient?.billingContactName && recipient.billingContactName !== recipient.name) {
    drawWrappedTextPaged(cursor, `Care of: ${recipient.name}`, {
      x: MARGIN,
      font,
      size: 10,
      maxWidth: leftWidth,
      lineHeight: 14,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
  const addressLine = recipient
    ? recipient.address ?? ""
    : [invoice.client.billingAddressLine1, invoice.client.billingCity, invoice.client.billingState, invoice.client.billingPostalCode]
        .filter(Boolean)
        .join(", ");
  if (addressLine) {
    drawWrappedTextPaged(cursor, addressLine, {
      x: MARGIN,
      font,
      size: 10,
      maxWidth: leftWidth,
      lineHeight: 14,
      color: rgb(0.3, 0.3, 0.3),
    });
  }
  cursor.y = Math.min(cursor.y, ry) - 30;

  // Line items table — Description / Quantity (Hours on a manual invoice)
  // / Amount. Unit price isn't a separate column here (kept simple); it's
  // still stored and used to compute Amount, same convention already used
  // when a line item is sent to Stripe (see createInvoiceItem in
  // src/lib/stripe.ts, which folds it into the description text there too).
  // Descriptions wrap and each row is as tall as its text; the header
  // repeats at the top of a continuation page.
  const cols = [
    { label: "Description", x: MARGIN, width: 330 },
    {
      label: invoice.quantityLabel ? QUANTITY_LABELS[invoice.quantityLabel] : isManual(invoice) ? "Hours" : "Quantity",
      x: MARGIN + 340,
      width: 70,
    },
    { label: "Amount", x: MARGIN + 420, width: right - MARGIN - 420 },
  ];
  const drawHeader = () => {
    for (const col of cols) cursor.page.drawText(col.label, { x: col.x, y: cursor.y, size: 10, font: boldFont });
    cursor.y -= 6;
    cursor.page.drawLine({ start: { x: MARGIN, y: cursor.y }, end: { x: right, y: cursor.y }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
    cursor.y -= 18;
  };
  cursor.ensure(40);
  drawHeader();

  for (const li of invoice.lineItems) {
    const lines = wrapText(li.description, font, 10, cols[0].width);
    const height = lines.length * 13 + 7;
    if (cursor.ensure(height)) drawHeader();
    lines.forEach((line, i) => cursor.page.drawText(line, { x: cols[0].x, y: cursor.y - i * 13, size: 10, font }));
    drawFitted(cursor.page, String(li.quantity), { x: cols[1].x, y: cursor.y, size: 10, font, maxWidth: cols[1].width });
    drawFitted(cursor.page, money(li.quantity * li.unitPrice), { x: cols[2].x, y: cursor.y, size: 10, font, maxWidth: cols[2].width });
    cursor.y -= height;
  }

  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const total = invoice.total ?? subtotal;
  cursor.ensure(70);
  cursor.page.drawLine({
    start: { x: cols[1].x, y: cursor.y + 10 },
    end: { x: right, y: cursor.y + 10 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  const totalRow = (label: string, value: string, bold: boolean) => {
    const f = bold ? boldFont : font;
    const size = bold ? 11 : 10;
    cursor.page.drawText(label, { x: cols[1].x, y: cursor.y, size, font: f, color: bold ? undefined : rgb(0.4, 0.4, 0.4) });
    drawFitted(cursor.page, value, { x: cols[2].x, y: cursor.y, size, font: f, maxWidth: cols[2].width });
    cursor.y -= 16;
  };
  totalRow("Subtotal", money(subtotal), false);
  if (invoice.taxAmount) totalRow("Tax", money(invoice.taxAmount), false);
  totalRow("Total", money(total), true);
  cursor.y -= 14;

  // Payment status
  const paid = invoice.amountPaid ?? 0;
  let statusLine: string;
  if (invoice.status === "PAID") {
    statusLine = invoice.paidAt ? `Paid in full on ${formatCalendarDate(invoice.paidAt)}` : "Paid in full";
  } else if (invoice.status === "PARTIALLY_PAID") {
    statusLine = `Partially paid: ${money(paid)} of ${money(total)} received — ${money(total - paid)} remaining`;
  } else if (invoice.status === "VOID") {
    statusLine = "Void";
  } else {
    statusLine = `Amount due: ${money(total)}`;
  }
  drawWrappedTextPaged(cursor, statusLine, {
    x: MARGIN,
    font: boldFont,
    size: 11,
    maxWidth: right - MARGIN,
    lineHeight: 14,
    color: rgb(0.1, 0.4, 0.2),
  });
  cursor.y -= 16;

  if (invoice.notes) {
    cursor.ensure(30);
    cursor.page.drawText("Notes", { x: MARGIN, y: cursor.y, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
    cursor.y -= 14;
    drawWrappedTextPaged(cursor, invoice.notes, { x: MARGIN, font, size: 10, maxWidth: right - MARGIN, lineHeight: 14 });
    cursor.y -= 20;
  }

  // Org-wide boilerplate (see InvoiceProfile) — always last, distinct from
  // the invoice's own notes above.
  if (invoice.footerText) {
    cursor.ensure(24);
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y + 14 },
      end: { x: right, y: cursor.y + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    drawWrappedTextPaged(cursor, invoice.footerText, {
      x: MARGIN,
      font,
      size: 8,
      maxWidth: right - MARGIN,
      lineHeight: 11,
      color: rgb(0.55, 0.55, 0.55),
    });
  }

  return pdfDoc.save();
}
