// Client-safe list of the PDF templates — no pdf-lib import, so the admin
// and invoice pages can build their pickers from it. The renderers
// themselves live in ./index.ts.
export type PdfTemplateId = "CLASSIC" | "MODERN";
export type QuantityLabelId = "HOURS" | "QTY";

/** InvoiceProfile's sender details — printed under the logo by the Modern
 * layouts, plus the text of the Modern invoice's PAYMENT box. */
export type SenderDetails = {
  address: string | null;
  phone: string | null;
  email: string | null;
  paymentInstructions: string | null;
};

export const DEFAULT_PDF_TEMPLATE: PdfTemplateId = "MODERN";

export const PDF_TEMPLATE_LABELS: Record<PdfTemplateId, string> = {
  MODERN: "Modern",
  CLASSIC: "Classic",
};

export const QUANTITY_LABELS: Record<QuantityLabelId, string> = {
  HOURS: "Hours",
  QTY: "Qty",
};

/** An invoice's own override wins, then its profile's choice, then Modern. */
export function resolvePdfTemplate(override: PdfTemplateId | null | undefined, profileChoice: PdfTemplateId | null | undefined) {
  return override ?? profileChoice ?? DEFAULT_PDF_TEMPLATE;
}

/** Content-Disposition type for the invoice/receipt PDF routes — `inline`
 * when the URL asks for it (?inline=1, see PdfPreviewDialog), so the
 * browser shows the PDF instead of downloading it. */
export function pdfDisposition(request: Request) {
  return new URL(request.url).searchParams.get("inline") === "1" ? "inline" : "attachment";
}
