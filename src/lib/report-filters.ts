import type { ReportFilters } from "@/lib/actions/reports";
import { SERVICE_STATUSES } from "@/lib/service-status";

// Reports page and export route read the same query string, so a "Download"
// link exports exactly what's on screen.
export const REPORT_FILTER_KEYS = [
  "clientId",
  "serviceId",
  "assigneeId",
  "serviceStatus",
  "invoiceStatus",
  "from",
  "to",
  "minOutstanding",
] as const;

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportFilters(params: Params): ReportFilters {
  const serviceStatus = SERVICE_STATUSES.find((s) => s === first(params.serviceStatus));
  const invoiceStatus = first(params.invoiceStatus);
  const from = first(params.from);
  const to = first(params.to);
  const min = Number(first(params.minOutstanding));
  return {
    clientId: first(params.clientId),
    serviceId: first(params.serviceId),
    assigneeId: first(params.assigneeId),
    serviceStatus,
    invoiceStatus: invoiceStatus === "OPEN" || invoiceStatus === "PAID" ? invoiceStatus : undefined,
    from: from && DATE_RE.test(from) ? from : undefined,
    to: to && DATE_RE.test(to) ? to : undefined,
    minOutstanding: first(params.minOutstanding) !== undefined && Number.isFinite(min) ? min : undefined,
  };
}

export function reportLevel(value: string | string[] | undefined): "client" | "service" {
  return first(value) === "client" ? "client" : "service";
}

export function searchParamsToRecord(searchParams: URLSearchParams): Params {
  return Object.fromEntries(searchParams.entries());
}
