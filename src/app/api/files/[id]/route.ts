import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, assertApplicationAccess, UnauthorizedError, ForbiddenError, AppRole } from "@/lib/rbac";
import { readStoredFile } from "@/lib/storage";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;

  try {
    const session = await requireSession();
    const asset = await prisma.fileAsset.findUnique({
      where: { id },
      include: { task: { include: { assignees: { select: { userId: true } } } } },
    });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (asset.applicationId) {
      await assertApplicationAccess(session, asset.applicationId, "view");
    } else if (asset.task) {
      const task = asset.task;
      if (task.applicationId) {
        await assertApplicationAccess(session, task.applicationId, "view");
      } else {
        const role = session.user.role as AppRole;
        const isAssignee = task.assignees.some((a) => a.userId === session.user.id);
        if (!(role === "ADMIN" || role === "MANAGER" || isAssignee || task.createdById === session.user.id)) {
          throw new ForbiddenError("Not your task");
        }
      }
    } else {
      throw new ForbiddenError("Not accessible");
    }

    const buffer = await readStoredFile(asset.storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(asset.fileName)}"`,
        "Content-Length": String(asset.sizeBytes),
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
