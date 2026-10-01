import { NextResponse } from "next/server";
import { getClientStatement } from "@/lib/actions/reports";
import { buildClientStatementDoc } from "@/lib/report-docs";
import { exportResponse, parseExportFormat } from "@/lib/report-export";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

// Client-level report (PDF §8) as ?format=csv|xlsx|pdf.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const format = parseExportFormat(new URL(request.url).searchParams.get("format"));
    if (!format) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
    const data = await getClientStatement(id).catch((e) => {
      // Auth failures still answer 401/403 below; anything else is a bad id.
      if (e instanceof UnauthorizedError || e instanceof ForbiddenError) throw e;
      return null;
    });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return exportResponse(buildClientStatementDoc(data), format, `${data.client.name}-report`);
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
