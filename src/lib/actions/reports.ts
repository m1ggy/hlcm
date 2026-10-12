"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, canAccessInvoices, ForbiddenError } from "@/lib/rbac";
import { listClients } from "@/lib/actions/clients";
import { listMoneyByClient } from "@/lib/actions/invoices";
import { NO_PROFILE, clientMatchesFilters, moneyForProfiles, type ClientListFilters } from "@/lib/client-list-filters";
import { invoiceMoney, summarizeByService, type ServiceMoney } from "@/lib/service-financials";
import type { $Enums, Prisma } from "@/generated/prisma/client";
import { SERVICE_STATUSES, type ServiceStatus } from "@/lib/service-status";
import { TASK_CLOSED_STATUSES } from "@/lib/task-status";

// Data behind the Reports page and the client/service exports (PDF §8).
// Same role gate as the client record; money is only filled in for the
// invoice roles (canAccessInvoices) and is null for everyone else — the
// same rule the client page follows.

const VIEW_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

// Matches BILLED_STATUSES in src/lib/service-financials.ts — drafts and
// voids are left out of the invoice/payment listings, same as the totals.
const BILLED_STATUSES: $Enums.InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];

const billedInvoiceInclude = {
  clientService: { select: { name: true } },
  invoiceProfile: { select: { name: true } },
  payments: { orderBy: { paidAt: "asc" } },
} satisfies Prisma.InvoiceInclude;

export type ReportFilters = {
  clientId?: string;
  serviceId?: string;
  assigneeId?: string;
  serviceStatus?: ServiceStatus;
  // OPEN = still owed something (sent / partially paid / overdue).
  invoiceStatus?: "OPEN" | "PAID";
  // Inclusive yyyy-mm-dd bounds on invoice issue date / adjustment date.
  from?: string;
  to?: string;
  minOutstanding?: number;
};

export type ServiceReportRow = {
  serviceId: string;
  serviceName: string;
  serviceType: string | null;
  status: ServiceStatus;
  startDate: Date | null;
  endDate: Date | null;
  team: string;
  clientId: string;
  clientName: string;
  openTasks: number;
  totalTasks: number;
  money: ServiceMoney | null;
};

export type ClientReportRow = {
  clientId: string;
  clientName: string;
  clientStatus: string;
  serviceCount: number;
  money: ServiceMoney | null;
};

const OPEN_INVOICE_STATUSES = ["SENT", "PARTIALLY_PAID", "OVERDUE"] as const;

function dateRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(from) }),
    // `to` is a calendar day — include all of it.
    ...(to && { lt: new Date(new Date(to).getTime() + 24 * 60 * 60 * 1000) }),
  };
}

function invoiceWhere(filters: ReportFilters, clientIds: string[]): Prisma.InvoiceWhereInput {
  return {
    clientId: { in: clientIds },
    issueDate: dateRange(filters.from, filters.to),
    ...(filters.invoiceStatus === "OPEN" && { status: { in: [...OPEN_INVOICE_STATUSES] } }),
    ...(filters.invoiceStatus === "PAID" && { status: "PAID" }),
  };
}

export async function runServiceReport(filters: ReportFilters) {
  const session = await requireRole([...VIEW_ROLES]);
  const showMoney = canAccessInvoices(session.user.role);
  const serviceStatus = SERVICE_STATUSES.find((s) => s === filters.serviceStatus);

  const services = await prisma.clientService.findMany({
    where: {
      active: true,
      client: { active: true },
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.serviceId && { id: filters.serviceId }),
      ...(filters.assigneeId && { team: { some: { userId: filters.assigneeId } } }),
      ...(serviceStatus && { status: serviceStatus }),
    },
    include: {
      client: { select: { id: true, name: true, status: true } },
      serviceType: { select: { name: true } },
      team: { select: { user: { select: { name: true } } } },
      tasks: { where: { archived: false, parentTaskId: null }, select: { status: true } },
    },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
  });

  const clientIds = [...new Set(services.map((s) => s.clientId))];
  // "General" invoices (no service) belong in a client's totals only when
  // the report isn't narrowed to particular services.
  const serviceScoped = !!(filters.serviceId || filters.assigneeId || serviceStatus);
  const [invoices, adjustments] = showMoney
    ? await Promise.all([
        prisma.invoice.findMany({
          where: invoiceWhere(filters, clientIds),
          select: { clientId: true, clientServiceId: true, status: true, total: true, amountPaid: true },
        }),
        prisma.serviceAdjustment.findMany({
          where: { clientServiceId: { in: services.map((s) => s.id) }, date: dateRange(filters.from, filters.to) },
          select: { clientServiceId: true, amount: true },
        }),
      ])
    : [[], []];

  const summary = summarizeByService(invoices, services.map((s) => s.id), adjustments);

  let serviceRows: ServiceReportRow[] = services.map((s) => ({
    serviceId: s.id,
    serviceName: s.name,
    serviceType: s.serviceType?.name ?? null,
    status: s.status,
    startDate: s.startDate,
    endDate: s.endDate,
    team: s.team.map((t) => t.user.name).join(", "),
    clientId: s.clientId,
    clientName: s.client.name,
    openTasks: s.tasks.filter((t) => !TASK_CLOSED_STATUSES.includes(t.status as (typeof TASK_CLOSED_STATUSES)[number])).length,
    totalTasks: s.tasks.length,
    money: showMoney ? summary.byService.get(s.id)! : null,
  }));

  let clientRows: ClientReportRow[] = clientIds.map((clientId) => {
    const clientServices = services.filter((s) => s.clientId === clientId);
    const client = clientServices[0].client;
    let money: ServiceMoney | null = null;
    if (showMoney) {
      const own = summarizeByService(
        serviceScoped
          ? invoices.filter((i) => i.clientId === clientId && clientServices.some((s) => s.id === i.clientServiceId))
          : invoices.filter((i) => i.clientId === clientId),
        clientServices.map((s) => s.id),
        adjustments.filter((a) => clientServices.some((s) => s.id === a.clientServiceId))
      );
      money = own.total;
    }
    return { clientId, clientName: client.name, clientStatus: client.status, serviceCount: clientServices.length, money };
  });

  if (showMoney && filters.minOutstanding !== undefined) {
    const min = filters.minOutstanding;
    serviceRows = serviceRows.filter((r) => (r.money?.outstanding ?? 0) >= min);
    clientRows = clientRows.filter((r) => (r.money?.outstanding ?? 0) >= min);
  }

  return { showMoney, serviceRows, clientRows };
}

// Everything the client-level export needs (PDF §8: client information,
// all services, financial totals, service breakdown, outstanding invoices
// and task status).
export async function getClientStatement(clientId: string) {
  const session = await requireRole([...VIEW_ROLES]);
  const showMoney = canAccessInvoices(session.user.role);
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: {
      services: {
        where: { active: true },
        include: {
          serviceType: { select: { name: true } },
          team: { select: { user: { select: { name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const serviceIds = client.services.map((s) => s.id);
  const [invoices, adjustments, tasks] = await Promise.all([
    showMoney
      ? prisma.invoice.findMany({
          where: { clientId },
          include: billedInvoiceInclude,
          orderBy: { issueDate: "asc" },
        })
      : Promise.resolve([]),
    showMoney
      ? prisma.serviceAdjustment.findMany({ where: { clientServiceId: { in: serviceIds } } })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: { clientServiceId: { in: serviceIds }, archived: false, parentTaskId: null },
      include: {
        clientService: { select: { name: true } },
        assignees: { select: { user: { select: { name: true } } } },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
    }),
  ]);
  const summary = showMoney ? summarizeByService(invoices, serviceIds, adjustments) : null;
  const outstandingInvoices = invoices.filter((i) => invoiceMoney(i).outstanding > 0);
  const billedInvoices = invoices.filter((i) => BILLED_STATUSES.includes(i.status));
  return { client, showMoney, summary, outstandingInvoices, billedInvoices, tasks };
}

// The Clients list's invoice & payment summary export: the clients the
// list is currently showing (same filters, re-applied here — see
// src/lib/client-list-filters.ts), their totals, and every billed invoice
// and recorded payment behind them. When a profile filter is on, the
// totals and invoices are just that profile's (no adjustments), the same
// as the list's money columns. Invoice roles only — it's all money.
export async function getClientsInvoiceSummary(filters: ClientListFilters, archived: boolean) {
  const session = await requireRole([...VIEW_ROLES]);
  if (!canAccessInvoices(session.user.role)) throw new ForbiddenError();
  const [clients, money] = await Promise.all([
    listClients({ filter: archived ? "archived" : "active" }),
    listMoneyByClient(),
  ]);
  const shown = clients.filter((c) => clientMatchesFilters(c, filters, money));
  const profileIds = filters.profileIds.filter((id) => id !== NO_PROFILE);
  const profileWhere: Prisma.InvoiceWhereInput =
    filters.profileIds.length === 0
      ? {}
      : {
          OR: [
            ...(profileIds.length > 0 ? [{ invoiceProfileId: { in: profileIds } }] : []),
            ...(filters.profileIds.includes(NO_PROFILE) ? [{ invoiceProfileId: null }] : []),
          ],
        };
  const invoices = await prisma.invoice.findMany({
    where: { clientId: { in: shown.map((c) => c.id) }, status: { in: BILLED_STATUSES }, ...profileWhere },
    include: { ...billedInvoiceInclude, client: { select: { name: true } } },
    orderBy: [{ client: { name: "asc" } }, { issueDate: "asc" }],
  });
  const clientRows = shown.map((c) => ({
    client: c,
    money: moneyForProfiles(money[c.id], filters.profileIds),
  }));
  return { clientRows, invoices, profileFiltered: filters.profileIds.length > 0 };
}

// The service-level export: only what belongs to this one service.
export async function getServiceStatement(serviceId: string) {
  const session = await requireRole([...VIEW_ROLES]);
  const showMoney = canAccessInvoices(session.user.role);
  const service = await prisma.clientService.findUniqueOrThrow({
    where: { id: serviceId },
    include: {
      client: { select: { id: true, name: true } },
      serviceType: { select: { name: true } },
      team: { select: { user: { select: { name: true } } } },
    },
  });
  const [invoices, adjustments, tasks] = await Promise.all([
    showMoney
      ? prisma.invoice.findMany({
          where: { clientServiceId: serviceId },
          include: { payments: { orderBy: { paidAt: "asc" } } },
          orderBy: { issueDate: "asc" },
        })
      : Promise.resolve([]),
    showMoney
      ? prisma.serviceAdjustment.findMany({ where: { clientServiceId: serviceId }, orderBy: { date: "asc" } })
      : Promise.resolve([]),
    prisma.task.findMany({
      where: { clientServiceId: serviceId, archived: false, parentTaskId: null },
      include: { assignees: { select: { user: { select: { name: true } } } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
    }),
  ]);
  const money = showMoney ? summarizeByService(invoices, [serviceId], adjustments).total : null;
  return { service, showMoney, money, invoices, adjustments, tasks };
}
