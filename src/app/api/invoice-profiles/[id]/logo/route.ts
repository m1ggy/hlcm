import { NextResponse } from "next/server";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/storage";

// Serves one profile's logo — used only for the preview thumbnail on
// /admin/invoice-profiles. Actual PDF generation reads the bytes
// directly (see getInvoiceLogo), not through this route.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await params;
    const profile = await prisma.invoiceProfile.findUnique({ where: { id } });
    if (!profile?.logoStorageKey || !profile.logoMimeType) {
      return NextResponse.json({ error: "No logo set" }, { status: 404 });
    }
    const bytes = await readStoredFile(profile.logoStorageKey);
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": profile.logoMimeType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
