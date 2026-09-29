// Picks the layout for our own generated invoice/receipt PDFs. Every caller
// (the invoice download route, sendManualInvoicePdf, and the receipt
// generation in addManualPayment/updatePayment) goes through here, so
// switching a profile's template — or one invoice's override — changes
// every download and email at once. Adding a layout: a new renderer file,
// a new PdfTemplate enum value, and a case below.
import { generateInvoicePdf, type InvoicePdfInput } from "@/lib/invoice-pdf";
import { generateReceiptPdf, type ReceiptPdfInput } from "@/lib/receipt-pdf";
import type { InvoiceProfileData } from "@/lib/invoice-profiles";
import { generateModernInvoicePdf } from "./modern-invoice";
import { generateModernReceiptPdf } from "./modern-receipt";
import type { PdfTemplateId } from "./options";

export function renderInvoicePdf(input: InvoicePdfInput, template: PdfTemplateId) {
  return template === "CLASSIC" ? generateInvoicePdf(input) : generateModernInvoicePdf(input);
}

export function renderReceiptPdf(input: ReceiptPdfInput, template: PdfTemplateId) {
  return template === "CLASSIC" ? generateReceiptPdf(input) : generateModernReceiptPdf(input);
}

/** The profile-derived part of either PDF's input (everything but the logo
 * bytes, which callers already load via getInvoiceLogo). */
export function profilePdfFields(profile: InvoiceProfileData | null) {
  return {
    footerText: profile?.footerText ?? null,
    profileName: profile?.name ?? null,
    quantityLabel: profile?.quantityLabel ?? null,
    sender: profile
      ? { address: profile.address, phone: profile.phone, email: profile.email, paymentInstructions: profile.paymentInstructions }
      : null,
  };
}
