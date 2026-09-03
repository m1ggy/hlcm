import { NextResponse } from "next/server";
import { getReceipt } from "@/lib/actions/invoices";
import { readStoredFile } from "@/lib/storage";
import { displayReceiptNumber } from "@/lib/invoice-format";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

// Unlike the invoice PDF route, this doesn't regenerate anything — a
// receipt's bytes are fixed at payment time (see addManualPayment in
// src/lib/actions/invoices.ts), so this just streams the stored file back.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const receipt = await getReceipt(id);
    // storageKey stays "" if the PDF failed to generate/upload when the
    // payment was recorded (see addManualPayment) — nothing to stream.
    if (!receipt.storageKey) return NextResponse.json({ error: "This receipt's PDF failed to generate" }, { status: 404 });
    const bytes = await readStoredFile(receipt.storageKey);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="receipt-${displayReceiptNumber(receipt)}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
