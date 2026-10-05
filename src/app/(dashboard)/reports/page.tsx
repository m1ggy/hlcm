import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { auth } from "@/auth";
import { runServiceReport } from "@/lib/actions/reports";
import { listClients } from "@/lib/actions/clients";
import { listAssignableUsers } from "@/lib/actions/applications";
import { listServiceOptions } from "@/lib/actions/client-services";
import { parseReportFilters, reportLevel, REPORT_FILTER_KEYS } from "@/lib/report-filters";
import { SERVICE_STATUSES, SERVICE_STATUS_LABELS } from "@/lib/service-status";
import { CLIENT_STATUS_BADGE_VARIANT, CLIENT_STATUS_LABELS, type ClientStatus } from "@/lib/client-status";
import { formatMoney } from "@/lib/time-entries";
import { formatCalendarDate } from "@/lib/invoice-format";
import type { ServiceMoney } from "@/lib/service-financials";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { ServiceStatusBadge } from "@/components/clients/service-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SearchParams = Record<string, string | string[] | undefined>;

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function sum(rows: (ServiceMoney | null)[]) {
  const t = { invoiced: 0, received: 0, adjustments: 0, outstanding: 0 };
  for (const m of rows) {
    if (!m) continue;
    t.invoiced += m.invoiced;
    t.received += m.received;
    t.adjustments += m.adjustments;
    t.outstanding += m.outstanding;
  }
  return t;
}

// Client- and service-level reporting across every client (PDF §8). The
// filters live in the query string (a plain GET form), so the Download
// links export exactly what's on screen.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  if (!session?.user || session.user.role === "CAREGIVER" || session.user.role === "CLIENT") notFound();

  const params = await searchParams;
  const level = reportLevel(params.level);
  const filters = parseReportFilters(params);
  const [report, clients, users, services] = await Promise.all([
    runServiceReport(filters),
    listClients({ filter: "active" }),
    listAssignableUsers(),
    listServiceOptions(),
  ]);
  const { showMoney } = report;

  const query = new URLSearchParams();
  for (const key of REPORT_FILTER_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value) query.set(key, value);
  }
  const levelHref = (l: string) => `/reports?${new URLSearchParams({ ...Object.fromEntries(query), level: l })}`;
  const exportHref = (format: string) =>
    `/api/export/reports?${new URLSearchParams({ ...Object.fromEntries(query), level, format })}`;
  const clientNames = new Map(clients.map((c) => [c.id, c.name]));
  const serviceOptions = services
    .filter((s) => !filters.clientId || s.clientId === filters.clientId)
    .map((s) => ({ ...s, label: filters.clientId ? s.name : `${s.name} — ${clientNames.get(s.clientId) ?? ""}` }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Reports</h1>
          <PageInfoButton title="Reports">
            <p>
              Totals by client or by service. Each service&apos;s outstanding balance is what&apos;s been invoiced, minus
              what&apos;s been received, plus any credits or charges added on the service.
            </p>
            <p>The download buttons export exactly what&apos;s shown, with the same filters.</p>
          </PageInfoButton>
        </div>
        <div className="flex gap-2">
          {(["xlsx", "pdf", "csv"] as const).map((format) => (
            <Button key={format} variant="outline" size="sm" nativeButton={false} render={<a href={exportHref(format)} />}>
              <Download className="size-3.5" /> {format === "xlsx" ? "Excel" : format.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent>
          <form method="GET" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="level" value={level} />
            <div className="space-y-1">
              <Label htmlFor="r-client">Client</Label>
              <select id="r-client" name="clientId" defaultValue={filters.clientId ?? ""} className={SELECT_CLASS}>
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-service">Service</Label>
              <select id="r-service" name="serviceId" defaultValue={filters.serviceId ?? ""} className={SELECT_CLASS}>
                <option value="">All services</option>
                {serviceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-assignee">Assigned employee</Label>
              <select id="r-assignee" name="assigneeId" defaultValue={filters.assigneeId ?? ""} className={SELECT_CLASS}>
                <option value="">Anyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-status">Service status</Label>
              <select id="r-status" name="serviceStatus" defaultValue={filters.serviceStatus ?? ""} className={SELECT_CLASS}>
                <option value="">Any status</option>
                {SERVICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SERVICE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            {showMoney && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="r-invoice">Invoice/payment status</Label>
                  <select id="r-invoice" name="invoiceStatus" defaultValue={filters.invoiceStatus ?? ""} className={SELECT_CLASS}>
                    <option value="">All invoices</option>
                    <option value="OPEN">Unpaid / partially paid</option>
                    <option value="PAID">Paid</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-from">Invoice date from</Label>
                  <Input id="r-from" name="from" type="date" defaultValue={filters.from} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-to">Invoice date to</Label>
                  <Input id="r-to" name="to" type="date" defaultValue={filters.to} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r-min">Outstanding at least</Label>
                  <Input
                    id="r-min"
                    name="minOutstanding"
                    type="number"
                    step="0.01"
                    placeholder="$0.00"
                    defaultValue={filters.minOutstanding}
                  />
                </div>
              </>
            )}
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" size="sm">
                Apply filters
              </Button>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/reports?level=${level}`} />}>
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex gap-1.5">
        {(["service", "client"] as const).map((l) => (
          <Link
            key={l}
            href={levelHref(l)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              level === l
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:bg-muted"
            }`}
          >
            {l === "service" ? "By service" : "By client"}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto">
          {level === "client" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Services</TableHead>
                  {showMoney && <MoneyHeads />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.clientRows.length === 0 && <EmptyRow colSpan={showMoney ? 7 : 3} />}
                {report.clientRows.map((r) => (
                  <TableRow key={r.clientId}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${r.clientId}`} className="hover:underline">
                        {r.clientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={CLIENT_STATUS_BADGE_VARIANT[r.clientStatus as ClientStatus]}>
                        {CLIENT_STATUS_LABELS[r.clientStatus as ClientStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.serviceCount}</TableCell>
                    {showMoney && r.money && <MoneyCells money={r.money} />}
                  </TableRow>
                ))}
              </TableBody>
              {showMoney && report.clientRows.length > 0 && (
                <TableFooter>
                  <TableRow className="font-medium">
                    <TableCell colSpan={3}>Total</TableCell>
                    <MoneyCells money={sum(report.clientRows.map((r) => r.money))} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Renewal/end</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Open tasks</TableHead>
                  {showMoney && <MoneyHeads />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.serviceRows.length === 0 && <EmptyRow colSpan={showMoney ? 10 : 6} />}
                {report.serviceRows.map((r) => (
                  <TableRow key={r.serviceId}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${r.clientId}/services/${r.serviceId}`} className="hover:underline">
                        {r.serviceName}
                      </Link>
                      {r.serviceType && <p className="text-xs font-normal text-muted-foreground">{r.serviceType}</p>}
                    </TableCell>
                    <TableCell>
                      <Link href={`/clients/${r.clientId}`} className="hover:underline">
                        {r.clientName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ServiceStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{r.endDate ? formatCalendarDate(r.endDate) : "—"}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-muted-foreground" title={r.team}>
                      {r.team || "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.openTasks}/{r.totalTasks}
                    </TableCell>
                    {showMoney && r.money && <MoneyCells money={r.money} />}
                  </TableRow>
                ))}
              </TableBody>
              {showMoney && report.serviceRows.length > 0 && (
                <TableFooter>
                  <TableRow className="font-medium">
                    <TableCell colSpan={6}>Total</TableCell>
                    <MoneyCells money={sum(report.serviceRows.map((r) => r.money))} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MoneyHeads() {
  return (
    <>
      <TableHead className="text-right">Invoiced</TableHead>
      <TableHead className="text-right">Received</TableHead>
      <TableHead className="text-right">Adjustments</TableHead>
      <TableHead className="text-right">Outstanding</TableHead>
    </>
  );
}

function MoneyCells({ money }: { money: Pick<ServiceMoney, "invoiced" | "received" | "adjustments" | "outstanding"> }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{formatMoney(money.invoiced)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatMoney(money.received)}</TableCell>
      <TableCell className="text-right tabular-nums">{money.adjustments ? formatMoney(money.adjustments) : "—"}</TableCell>
      <TableCell className={`text-right tabular-nums ${money.outstanding > 0 ? "text-destructive" : ""}`}>
        {formatMoney(money.outstanding)}
      </TableCell>
    </>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
        Nothing matches these filters.
      </TableCell>
    </TableRow>
  );
}
