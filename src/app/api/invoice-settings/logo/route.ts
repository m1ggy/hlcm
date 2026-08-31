import { NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { getInvoiceSettings } from "@/lib/invoice-settings";
import { readStoredFile } from "@/lib/storage";

// Serves the currently-set invoice logo — used only for the preview
// thumbnail on /admin/invoice-settings. Actual PDF generation reads the
// bytes directly (see getInvoiceLogo), not through this route.
export async function GET() {
  try {
    await requireRole(["ADMIN"]);
    const settings = await getInvoiceSettings();
    if (!settings.logoStorageKey || !settings.logoMimeType) {
      return NextResponse.json({ error: "No logo set" }, { status: 404 });
    }
    const bytes = await readStoredFile(settings.logoStorageKey);
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": settings.logoMimeType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
