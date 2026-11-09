import { NextRequest, NextResponse } from "next/server";
import { db, currentOrganization } from "@/lib/db";
import { requireSession, assertApplicationAccess, UnauthorizedError, ForbiddenError, AppRole, isManagement } from "@/lib/rbac";
import { readStoredFile } from "@/lib/storage";
import { taskWhere, workScope } from "@/lib/work";

// Raster images may be shown in place (correspondence thumbnails, ?inline=1);
// everything else always downloads. No SVG: it can carry script.
const INLINE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;

  try {
    const session = await requireSession();
    const asset = await db.fileAsset.findUnique({
      where: { id },
      include: { task: { include: { assignees: { select: { userId: true } } } } },
    });
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Correspondence is internal (src/lib/correspondence.ts), even when its parent isn't.
    if (asset.correspondenceId && (session.user.role === "CLIENT" || session.user.role === "CAREGIVER")) throw new ForbiddenError("Not accessible");

    if (asset.applicationId) {
      await assertApplicationAccess(session, asset.applicationId, "view");
    } else if (asset.task) {
      const task = asset.task;
      if (task.applicationId) {
        await assertApplicationAccess(session, task.applicationId, "view");
      } else {
        const role = session.user.role as AppRole;
        const isAssignee = task.assignees.some((a) => a.userId === session.user.id);
        if (!(isManagement(role) || isAssignee || task.createdById === session.user.id)) {
          throw new ForbiddenError("Not your task");
        }
      }
    } else if (asset.workTaskId) {
      // A project task's file: whoever can see the task (src/lib/work.ts).
      const org = await currentOrganization();
      const scope = workScope({ userId: session.user.id, role: session.user.role, isAssigned: Boolean(session.user.isAssigned), orgKind: org.kind });
      const visible = await db.workTask.findFirst({ where: { id: asset.workTaskId, ...taskWhere(scope) }, select: { id: true } });
      if (!visible) throw new ForbiddenError("Not accessible");
    } else if (asset.clientId) {
      // Same flat role gate as uploadClientFile/listClientFiles
      // (src/lib/actions/files.ts) — Clients have no per-record
      // access-grant concept the way Applications do.
      const role = session.user.role as AppRole;
      if (!(isManagement(role) || role === "STAFF")) {
        throw new ForbiddenError("Not accessible");
      }
    } else {
      throw new ForbiddenError("Not accessible");
    }

    const buffer = await readStoredFile(asset.storageKey);
    const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_TYPES.has(asset.mimeType);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(asset.fileName)}"`,
        "Content-Length": String(asset.sizeBytes),
        "X-Content-Type-Options": "nosniff",
        ...(inline && { "Cache-Control": "private, max-age=300" }),
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
