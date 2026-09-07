import { NextResponse } from "next/server";
import { getInvoiceAttachment } from "@/lib/actions/invoice-attachments";
import { readStoredFile } from "@/lib/storage";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const attachment = await getInvoiceAttachment(id);
    const bytes = await readStoredFile(attachment.storageKey);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Content-Length": String(attachment.sizeBytes),
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
