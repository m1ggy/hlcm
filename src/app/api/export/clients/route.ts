import { NextResponse } from "next/server";
import { getClientsInvoiceSummary } from "@/lib/actions/reports";
import { buildClientsInvoiceSummaryDoc } from "@/lib/report-docs";
import { exportResponse, parseExportFormat } from "@/lib/report-export";
import { filtersFromSearchParams } from "@/lib/client-list-filters";
import { UnauthorizedError, ForbiddenError } from "@/lib/rbac";

// The Clients list's invoice & payment summary as ?format=csv|xlsx|pdf,
// with the list's own filters (?q, status, project, profile, archived)
// so the file matches what was on screen.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const format = parseExportFormat(params.get("format"));
    if (!format) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
    const { filters, archived } = filtersFromSearchParams(params);
    const data = await getClientsInvoiceSummary(filters, archived);
    const filtered =
      filters.query.trim() || filters.statuses.length || filters.projectIds.length || filters.profileIds.length;
    const subtitle = `${archived ? "Archived clients" : "Active clients"}${filtered ? " (filtered)" : ""} — ${data.clientRows.length} client${data.clientRows.length === 1 ? "" : "s"}${data.profileFiltered ? "; totals for the selected invoice profiles only" : ""}`;
    return exportResponse(buildClientsInvoiceSummaryDoc(data, subtitle), format, "clients-invoice-summary");
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
}
