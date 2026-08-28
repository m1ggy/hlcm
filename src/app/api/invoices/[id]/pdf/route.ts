import { NextResponse } from "next/server";
import { getInvoice } from "@/lib/actions/invoices";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { displayInvoiceNumber } from "@/lib/invoice-format";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    const bytes = await generateInvoicePdf(invoice);

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
