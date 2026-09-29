import { NextResponse } from "next/server";
import { getInvoice } from "@/lib/actions/invoices";
import { computeOutstandingAccountBalance } from "@/lib/actions/care-recipient-invoices";
import { renderInvoicePdf, profilePdfFields } from "@/lib/pdf-templates";
import { resolvePdfTemplate } from "@/lib/pdf-templates/options";
import { generateCareRecipientInvoicePdf } from "@/lib/care-recipient-invoice-pdf";
import { displayInvoiceNumber } from "@/lib/invoice-format";
import { getInvoiceProfile, getInvoiceLogo } from "@/lib/invoice-profiles";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    const profile = await getInvoiceProfile(invoice.invoiceProfileId);
    const logo = await getInvoiceLogo(profile);
    const bytes = invoice.careRecipient
      ? await generateCareRecipientInvoicePdf({
          ...invoice,
          careRecipient: invoice.careRecipient,
          logo,
          footerText: profile?.footerText ?? null,
          profileName: profile?.name ?? null,
          outstandingAccountBalance: await computeOutstandingAccountBalance(invoice.careRecipient.id),
        })
      : await renderInvoicePdf(
          { ...invoice, logo, ...profilePdfFields(profile) },
          resolvePdfTemplate(invoice.pdfTemplate, profile?.invoiceTemplate)
        );

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${displayInvoiceNumber(invoice)}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
