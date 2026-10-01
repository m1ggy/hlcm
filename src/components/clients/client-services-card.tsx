"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MoreHorizontal, Search } from "lucide-react";
import { archiveClientService, restoreClientService, setClientServiceStatus } from "@/lib/actions/client-services";
import { unexpectedErrorMessage, type ActionResult } from "@/lib/action-result";
import { SERVICE_STATUSES, SERVICE_STATUS_LABELS } from "@/lib/service-status";
import { formatShortCalendarDate } from "@/lib/invoice-format";
import { formatMoney } from "@/lib/time-entries";
import type { ServiceMoney } from "@/lib/service-financials";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ServiceStatusBadge } from "@/components/clients/service-status-badge";
import { ServiceFormDialog, type ServiceFormValues } from "@/components/clients/service-form-dialog";

export type ClientServiceRow = ServiceFormValues & {
  active: boolean;
  serviceType: { id: string; name: string; hex: string; textColor: string } | null;
};

type Option = { id: string; name: string };

function formatDate(date: Date | null) {
  return date ? formatShortCalendarDate(new Date(date)) : "—";
}

function useRowAction() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) toast.error(result.error);
        else toast.success(success);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Something went wrong"));
      }
    });
  }
  return { isPending, run };
}

function ServiceRowActions({
  clientId,
  service,
  serviceTypes,
  users,
  canArchive,
}: {
  clientId: string;
  service: ClientServiceRow;
  serviceTypes: Option[];
  users: Option[];
  canArchive: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const { isPending, run } = useRowAction();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="size-7" disabled={isPending} aria-label={`Actions for ${service.name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Change status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {SERVICE_STATUSES.filter((s) => s !== service.status).map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => run(() => setClientServiceStatus(service.id, s), `${service.name}: ${SERVICE_STATUS_LABELS[s]}`)}
                >
                  {SERVICE_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {canArchive && (
            <>
              <DropdownMenuSeparator />
              {service.active ? (
                <DropdownMenuItem
                  onClick={() => {
                    if (!confirm(`Archive "${service.name}"? Its invoices, tasks and files stay linked to it.`)) return;
                    run(() => archiveClientService(service.id), "Service archived");
                  }}
                >
                  Archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => run(() => restoreClientService(service.id), "Service restored")}>
                  Restore
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ServiceFormDialog
        key={editOpen ? "open" : "closed"}
        clientId={clientId}
        service={service}
        serviceTypes={serviceTypes}
        users={users}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

type Money = { byService: Record<string, ServiceMoney>; general: ServiceMoney; total: ServiceMoney };

function MoneyCells({ m }: { m: ServiceMoney | undefined }) {
  const outstanding = m?.outstanding ?? 0;
  return (
    <>
      <TableCell className="text-right tabular-nums">{formatMoney(m?.invoiced ?? 0)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatMoney(m?.received ?? 0)}</TableCell>
      <TableCell className={`text-right tabular-nums ${outstanding > 0 ? "text-destructive" : ""}`}>
        {formatMoney(outstanding)}
      </TableCell>
    </>
  );
}

/**
 * The client's services with their own money columns (PDF §5–6, Services
 * tab mockup). `variant="summary"` is the Overview's "Services Summary":
 * live services only, fewer columns, no search. `money` is null for anyone
 * without invoice access — the columns are left out entirely.
 */
export function ClientServicesCard({
  clientId,
  services,
  serviceTypes,
  users,
  money,
  canArchive,
  variant = "full",
}: {
  clientId: string;
  services: ClientServiceRow[];
  serviceTypes: Option[];
  users: Option[];
  money: Money | null;
  canArchive: boolean;
  variant?: "full" | "summary";
}) {
  const full = variant === "full";
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const archivedCount = services.filter((s) => !s.active).length;
  const q = query.trim().toLowerCase();
  const visible = services
    .filter((s) => s.active || (full && showArchived))
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.serviceType?.name.toLowerCase().includes(q))
    .filter((s) => !status || s.status === status);
  // Columns before the money ones: name, (type), status, start, (renewal).
  const leading = full ? 5 : 3;
  const columnCount = leading + (money ? 3 : 0) + 1;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">
            {full ? `Services (${services.filter((s) => s.active).length})` : "Services Summary"}
          </h2>
          {full && (
            <div className="flex flex-wrap items-center gap-2">
              {archivedCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
                  {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
                </Button>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search services..."
                  className="h-8 w-52 pl-8"
                  aria-label="Search services"
                />
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                {SERVICE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {SERVICE_STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                {full && <TableHead>Service Type</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                {full && <TableHead>Renewal Date</TableHead>}
                {money && (
                  <>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </>
                )}
                <TableHead className="w-16 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                    {services.length === 0
                      ? "No services yet. Add one to track its tasks, documents and billing separately."
                      : "No services match."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((service) => (
                <TableRow key={service.id} className={service.active ? undefined : "opacity-60"}>
                  <TableCell className="font-medium">
                    <Link href={`/clients/${clientId}/services/${service.id}`} className="text-primary hover:underline">
                      {service.name}
                    </Link>
                    {!service.active && (
                      <Badge variant="outline" className="ml-2">
                        Archived
                      </Badge>
                    )}
                  </TableCell>
                  {full && <TableCell>{service.serviceType?.name ?? "—"}</TableCell>}
                  <TableCell>
                    <ServiceStatusBadge status={service.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatDate(service.startDate)}</TableCell>
                  {full && <TableCell className="whitespace-nowrap tabular-nums">{formatDate(service.endDate)}</TableCell>}
                  {money && <MoneyCells m={money.byService[service.id]} />}
                  <TableCell className="text-center">
                    <ServiceRowActions
                      clientId={clientId}
                      service={service}
                      serviceTypes={serviceTypes}
                      users={users}
                      canArchive={canArchive}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {money && (
              <TableFooter>
                {money.general.invoiceCount > 0 && (
                  <TableRow>
                    <TableCell colSpan={leading} className="text-muted-foreground" title="Invoices not filed under any service">
                      General (no service)
                    </TableCell>
                    <MoneyCells m={money.general} />
                    <TableCell />
                  </TableRow>
                )}
                <TableRow className="font-semibold">
                  <TableCell colSpan={leading}>Total</TableCell>
                  <MoneyCells m={money.total} />
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
