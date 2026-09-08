import { NextResponse } from "next/server";
import { getFormSubmissionFile } from "@/lib/actions/form-submissions";
import { readStoredFile } from "@/lib/storage";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

// `id` (the submission) is part of the URL for readability/audit-trail
// purposes only — the file itself is looked up and authorized purely by
// `fileId`, same as every other file download route in the app.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const { fileId } = await params;
    const file = await getFormSubmissionFile(fileId);
    const bytes = await readStoredFile(file.storageKey);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        "Content-Length": String(file.sizeBytes),
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
