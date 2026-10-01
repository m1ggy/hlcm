import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CircleCheck, CircleDashed, Loader } from "lucide-react";
import { auth } from "@/auth";
import { canAccessInvoices, isAdmin, isManagement } from "@/lib/rbac";
import {
  archiveClientService,
  getClientService,
  getClientServiceAuditLog,
  restoreClientService,
} from "@/lib/actions/client-services";
import { listAssignableUsers } from "@/lib/actions/applications";
import { listServiceTasks } from "@/lib/actions/tasks";
import { listClientFiles } from "@/lib/actions/files";
import { listClientNotes } from "@/lib/actions/notes";
import { listInvoices } from "@/lib/actions/invoices";
import { listServiceAdjustments } from "@/lib/actions/service-adjustments";
import { listInvoiceProfiles } from "@/lib/invoice-profiles";
import { listServiceTypes } from "@/lib/actions/projects";
import { invoiceMoney, summarizeByService } from "@/lib/service-financials";
import { isManual } from "@/lib/invoice-shared";
import { formatMoney } from "@/lib/time-entries";
import { displayInvoiceNumber, displayReceiptNumber, formatShortCalendarDate } from "@/lib/invoice-format";
import { SERVICE_STATUS_LABELS } from "@/lib/service-status";
import { TASK_STATUS_BADGE_VARIANT, TASK_STATUS_LABELS } from "@/lib/task-status";
import { InvoiceStatusBadge, isInvoiceOverdue } from "@/components/invoices/invoice-status-badge";
import { ServiceStatusBadge } from "@/components/clients/service-status-badge";
import { ServiceFormDialog } from "@/components/clients/service-form-dialog";
import { ServiceTasksCard, type ServiceTask } from "@/components/clients/service-tasks-card";
import { ServiceAdjustmentsCard } from "@/components/clients/service-adjustments-card";
import { ServiceAccountingActions } from "@/components/clients/service-accounting-actions";
import { ClientFilePool } from "@/components/clients/client-file-pool";
import { ClientNotesPanel } from "@/components/clients/client-notes-panel";
import { AuditLogPanel } from "@/components/applications/audit-log-panel";
import { EntityAvatar } from "@/components/shared/entity-avatar";
import { MoreMenu } from "@/components/shared/more-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

const TABS = ["overview", "tasks", "accounting", "documents", "notes", "activity"] as const;

// One service's own workspace (PDF screens 4–6): its details, tasks,
// invoices/payments/adjustments, documents, notes and history — the client
// page links here from every service row.
export default async function ClientServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; serviceId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id: clientId, serviceId } = await params;
  const { tab } = await searchParams;

  const session = await auth();
  if (!session?.user || session.user.role === "CAREGIVER") notFound();

  let service;
  try {
    service = await getClientService(serviceId);
  } catch {
    notFound();
  }
  if (service.clientId !== clientId) notFound();

  const canManageInvoices = canAccessInvoices(session.user.role);
  const requestedTab = TABS.find((t) => t === tab) ?? "overview";
  const initialTab = requestedTab === "accounting" && !canManageInvoices ? "overview" : requestedTab;

  const [assignableUsers, tasks, files, notes, auditLog, invoices, profiles, serviceTypes, adjustments] = await Promise.all([
    listAssignableUsers(),
    listServiceTasks(serviceId),
    listClientFiles(clientId, { clientServiceId: serviceId }),
    listClientNotes(clientId, { clientServiceId: serviceId }),
    getClientServiceAuditLog(serviceId),
    canManageInvoices ? listInvoices({ clientServiceId: serviceId }) : Promise.resolve([]),
    canManageInvoices ? listInvoiceProfiles() : Promise.resolve([]),
    listServiceTypes(),
    canManageInvoices ? listServiceAdjustments(serviceId) : Promise.resolve([]),
  ]);

  const money = canManageInvoices
    ? summarizeByService(
        invoices,
        [serviceId],
        adjustments.map((a) => ({ clientServiceId: serviceId, amount: a.amount }))
      ).total
    : null;
  const payments = invoices
    .flatMap((invoice) => invoice.payments.map((p) => ({ ...p, invoice })))
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  const payableInvoices = invoices
    .filter((i) => isManual(i) && (i.status === "SENT" || i.status === "PARTIALLY_PAID"))
    .map((i) => ({ id: i.id, number: displayInvoiceNumber(i), remaining: invoiceMoney(i).outstanding }));
  const users = assignableUsers.map((u) => ({ id: u.id, name: u.name }));
  const serviceTasks = tasks as ServiceTask[];
  const auditLookups = {
    users: Object.fromEntries(assignableUsers.map((u) => [u.id, u.name])),
    serviceTypes: Object.fromEntries(serviceTypes.map((t) => [t.id, t.name])),
  };
  const team = service.team.map((t) => t.user.name).join(", ") || "—";
  const fee =
    service.feeAmount != null
      ? `${formatMoney(service.feeAmount)}${service.feeFrequency ? ` / ${service.feeFrequency.replace(/^per /, "")}` : ""}`
      : "—";
  const date = (d: Date | null) => (d ? formatShortCalendarDate(d) : "—");
  const tabHref = (t: string) => `/clients/${clientId}/services/${serviceId}?tab=${t}`;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/clients" />}>Clients</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/clients/${clientId}?tab=services`} />}>{service.client.name}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{service.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <EntityAvatar name={service.name} tone="red" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {service.name}
              <ServiceStatusBadge status={service.status} />
              {!service.active && <Badge variant="outline">Archived</Badge>}
            </h1>
            <p className="text-muted-foreground">
              {service.serviceType?.name ? `${service.serviceType.name} · ` : ""}
              <Link href={`/clients/${clientId}`} className="hover:underline">
                {service.client.name}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <Fact label="Start Date" value={date(service.startDate)} />
            <Fact label="Renewal Date" value={date(service.endDate)} />
            <Fact label="Assigned Team" value={team} />
            <Fact label="Fee Structure" value={fee} />
          </dl>
          <div className="flex items-center gap-2">
            <ServiceFormDialog
              clientId={clientId}
              service={service}
              serviceTypes={serviceTypes.map((t) => ({ id: t.id, name: t.name }))}
              users={users}
              triggerKind="edit"
            />
            <MoreMenu
              exportHref={`/api/export/client-services/${serviceId}`}
              archive={
                isManagement(session.user.role)
                  ? {
                      archived: !service.active,
                      label: service.name,
                      action: service.active
                        ? archiveClientService.bind(null, serviceId)
                        : restoreClientService.bind(null, serviceId),
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          {canManageInvoices && <TabsTrigger value="accounting">Accounting</TabsTrigger>}
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardContent>
                <h2 className="mb-3 text-base font-medium">Service Details</h2>
                <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
                  <DetailRow label="Service Type" value={service.serviceType?.name ?? "—"} />
                  <DetailRow label="Description" value={service.description || "—"} />
                  <DetailRow label="Status" value={SERVICE_STATUS_LABELS[service.status]} />
                  <DetailRow label="Start Date" value={date(service.startDate)} />
                  <DetailRow label="Renewal Date" value={date(service.endDate)} />
                  <DetailRow label="Assigned Team" value={team} />
                  <DetailRow label="Fee Structure" value={fee} />
                  <DetailRow label="Notes" value={service.notes || "—"} multiline />
                </dl>
              </CardContent>
            </Card>

            <div className="space-y-6">
              {money && (
                <Card>
                  <CardContent>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-medium">Financial Summary ({service.name})</h2>
                      <Link
                        href={tabHref("accounting")}
                        className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        View Accounting <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                    <FinancialTiles money={money} />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-base font-medium">Recent Tasks</h2>
                    <Link
                      href={tabHref("tasks")}
                      className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      View All <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                  {serviceTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tasks yet.</p>
                  ) : (
                    <ul className="divide-y">
                      {serviceTasks.slice(0, 5).map((task) => {
                        const Icon =
                          task.status === "COMPLETED" ? CircleCheck : task.status === "IN_PROGRESS" ? Loader : CircleDashed;
                        return (
                          <li key={task.id} className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
                            <Icon
                              className={cn(
                                "size-4 shrink-0",
                                task.status === "COMPLETED" ? "text-emerald-600" : "text-muted-foreground"
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">{task.label}</span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {task.dueDate ? `Due ${formatShortCalendarDate(task.dueDate)}` : ""}
                            </span>
                            <Badge variant={TASK_STATUS_BADGE_VARIANT[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="pt-4">
          <ServiceTasksCard
            clientId={clientId}
            clientServiceId={serviceId}
            tasks={serviceTasks}
            assignableUsers={users}
            currentUserId={session.user.id}
            isAdmin={isAdmin(session.user.role)}
          />
        </TabsContent>

        {canManageInvoices && money && (
          <TabsContent value="accounting" className="space-y-6 pt-4">
            <div className="flex justify-end">
              <ServiceAccountingActions
                client={{ id: clientId, name: service.client.name }}
                service={{ id: serviceId, name: service.name }}
                profiles={profiles.map((p) => ({ id: p.id, name: p.name }))}
                payableInvoices={payableInvoices}
              />
            </div>
            <div className="grid gap-6 xl:grid-cols-5">
              <Card className="xl:col-span-3">
                <CardContent>
                  <h2 className="mb-3 text-base font-medium">Invoices ({invoices.length})</h2>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Invoice Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No invoices filed under this service yet.
                            </TableCell>
                          </TableRow>
                        )}
                        {invoices.map((invoice) => {
                          const owed = invoiceMoney(invoice).outstanding;
                          return (
                            <TableRow key={invoice.id}>
                              <TableCell className="font-medium tabular-nums">
                                <Link href={`/invoices/${invoice.id}`} className="text-primary hover:underline">
                                  {displayInvoiceNumber(invoice)}
                                </Link>
                              </TableCell>
                              <TableCell className="whitespace-nowrap tabular-nums">{date(invoice.issueDate)}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {invoice.total != null ? formatMoney(invoice.total) : "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap tabular-nums">{date(invoice.dueDate)}</TableCell>
                              <TableCell>
                                <InvoiceStatusBadge status={isInvoiceOverdue(invoice) ? "OVERDUE" : invoice.status} />
                              </TableCell>
                              <TableCell className={`text-right tabular-nums ${owed > 0 ? "text-destructive" : ""}`}>
                                {formatMoney(owed)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6 xl:col-span-2">
                <Card>
                  <CardContent>
                    <h2 className="mb-3 text-base font-medium">Financial Summary ({service.name})</h2>
                    <FinancialTiles money={money} />
                    {money.adjustments !== 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Includes {formatMoney(money.adjustments)} in adjustments.
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <h2 className="mb-3 text-base font-medium">Payments ({payments.length})</h2>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Payment Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Reference #</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No payments recorded yet.
                            </TableCell>
                          </TableRow>
                        )}
                        {payments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell className="whitespace-nowrap tabular-nums">{date(payment.paidAt)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(payment.amount)}</TableCell>
                            <TableCell className="tabular-nums">
                              <Link
                                href={`/invoices/${payment.invoice.id}`}
                                className="hover:underline"
                                title={`${payment.paymentMethod} · invoice ${displayInvoiceNumber(payment.invoice)}`}
                              >
                                {payment.receipt ? displayReceiptNumber(payment.receipt) : displayInvoiceNumber(payment.invoice)}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Received
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>

            <ServiceAdjustmentsCard clientServiceId={serviceId} adjustments={adjustments} />
          </TabsContent>
        )}

        <TabsContent value="documents" className="pt-4">
          <ClientFilePool clientId={clientId} clientServiceId={serviceId} files={files} canEdit />
        </TabsContent>

        <TabsContent value="notes" className="pt-4">
          <Card>
            <CardContent>
              <ClientNotesPanel
                clientId={clientId}
                clientServiceId={serviceId}
                notes={notes}
                mentionableUsers={assignableUsers}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="pt-4">
          <Card>
            <CardContent>
              <div className="max-h-[40rem] overflow-y-auto pr-1">
                <AuditLogPanel auditLog={auditLog} {...auditLookups} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function DetailRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={multiline ? "whitespace-pre-wrap" : undefined}>{value}</dd>
    </>
  );
}

function FinancialTiles({ money }: { money: { invoiced: number; received: number; outstanding: number } }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg p-3 ring-1 ring-foreground/10">
        <p className="text-xs text-muted-foreground">Total Invoiced</p>
        <p className="text-lg font-semibold tabular-nums">{formatMoney(money.invoiced)}</p>
      </div>
      <div className="rounded-lg p-3 ring-1 ring-foreground/10">
        <p className="text-xs text-muted-foreground">Total Received</p>
        <p className="text-lg font-semibold tabular-nums">{formatMoney(money.received)}</p>
      </div>
      <div className="rounded-lg bg-rose-50 p-3 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:ring-rose-900">
        <p className="text-xs text-rose-700 dark:text-rose-400">Outstanding</p>
        <p className="text-lg font-semibold text-rose-700 tabular-nums dark:text-rose-400">{formatMoney(money.outstanding)}</p>
      </div>
    </div>
  );
}
