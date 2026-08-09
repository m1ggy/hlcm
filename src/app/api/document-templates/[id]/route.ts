import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { readStoredFile } from "@/lib/storage";

// Same audience as listDocumentTemplates — anyone who can generate a
// document from a template can also see the source file it comes from.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/document-templates/[id]">) {
  const { id } = await ctx.params;

  try {
    await requireRole(["ADMIN", "MANAGER", "STAFF"]);
    const template = await prisma.documentTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const buffer = await readStoredFile(template.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(template.fileName)}"`,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
