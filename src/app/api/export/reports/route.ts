import { NextResponse } from "next/server";
import { runServiceReport } from "@/lib/actions/reports";
import { buildReportDoc } from "@/lib/report-docs";
import { exportResponse, parseExportFormat } from "@/lib/report-export";
import { parseReportFilters, reportLevel, searchParamsToRecord } from "@/lib/report-filters";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

// The Reports page's Download buttons: same filters as the page, plus
// ?level=client|service and ?format=csv|xlsx|pdf.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const format = parseExportFormat(params.get("format"));
    if (!format) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
    const level = reportLevel(params.get("level") ?? undefined);
    const report = await runServiceReport(parseReportFilters(searchParamsToRecord(params)));
    const doc = buildReportDoc(level, report, level === "client" ? "By client" : "By service");
    return exportResponse(doc, format, `${level}-report`);
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
