"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, canAccessInvoices } from "@/lib/rbac";
import { recordAudit, recordFieldChanges } from "@/lib/audit";
import { toActionResult } from "@/lib/action-result";
import { applySuggestedClientStatus } from "@/lib/client-services";
import { SERVICE_STATUSES } from "@/lib/service-status";
import { displayInvoiceNumber } from "@/lib/invoice-format";

// The services a client receives (see ClientService in prisma/schema.prisma).
// Same roles as the client record itself. Each change is logged twice: an
// event on the owning Client (so the client's activity feed reads "Added
// service X") and field-level diffs on the ClientService (its own history).

const MANAGE_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

const serviceFields = {
  name: z.string().trim().min(1, "Name is required"),
  serviceTypeId: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(SERVICE_STATUSES),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  feeAmount: z.coerce.number().min(0, "Fee can't be negative").optional(),
  feeFrequency: z.string().optional(),
  notes: z.string().optional(),
  teamUserIds: z.array(z.string()),
};

const createSchema = z.object({ clientId: z.string().min(1), ...serviceFields });
const updateSchema = z.object(serviceFields);

function readFields(formData: FormData) {
  const opt = (key: string) => (formData.get(key) as string | null) || undefined;
  return {
    name: formData.get("name"),
    serviceTypeId: opt("serviceTypeId"),
    description: opt("description"),
    status: opt("status") ?? "PENDING",
    startDate: opt("startDate"),
    endDate: opt("endDate"),
    feeAmount: opt("feeAmount"),
    feeFrequency: opt("feeFrequency"),
    notes: opt("notes"),
    teamUserIds: formData.getAll("teamUserIds").filter((v): v is string => typeof v === "string" && v !== ""),
  };
}

// Optional fields come back as null (not undefined) so clearing one in the
// edit dialog actually clears it.
function toData(parsed: z.infer<typeof updateSchema>) {
  return {
    name: parsed.name,
    serviceTypeId: parsed.serviceTypeId ?? null,
    description: parsed.description ?? null,
    status: parsed.status,
    startDate: parsed.startDate ? new Date(parsed.startDate) : null,
    endDate: parsed.endDate ? new Date(parsed.endDate) : null,
    feeAmount: parsed.feeAmount ?? null,
    feeFrequency: parsed.feeFrequency ?? null,
    notes: parsed.notes ?? null,
  };
}

const serviceInclude = {
  serviceType: { select: { id: true, name: true, hex: true, textColor: true } },
  team: { select: { user: { select: { id: true, name: true } } } },
} as const;

function revalidateClient(clientId: string) {
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}

// Live services first in the order they were added; archived ones only on
// request (the Services tab's "show archived" toggle).
export async function listClientServices(clientId: string, opts: { includeArchived?: boolean } = {}) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.clientService.findMany({
    where: { clientId, ...(opts.includeArchived ? {} : { active: true }) },
    include: serviceInclude,
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
}

// Every live service across all clients, for the pickers on pages that
// aren't about one client (the Invoices page's New invoice dialogs) — each
// picker narrows to the chosen client's own.
export async function listServiceOptions() {
  await requireRole([...MANAGE_ROLES]);
  return prisma.clientService.findMany({
    where: { active: true },
    select: { id: true, name: true, clientId: true },
    orderBy: { name: "asc" },
  });
}

export async function getClientService(id: string) {
  await requireRole([...MANAGE_ROLES]);
  return prisma.clientService.findUniqueOrThrow({
    where: { id },
    include: { ...serviceInclude, client: { select: { id: true, name: true, status: true } } },
  });
}

// Adjustment entries carry amounts, so only the invoice roles see them —
// same rule as every other money figure on the client/service pages.
const MONEY_ACTIONS = ["add_adjustment", "remove_adjustment"];

export async function getClientServiceAuditLog(id: string) {
  const session = await requireRole([...MANAGE_ROLES]);
  const showMoney = canAccessInvoices(session.user.role);
  return prisma.auditLog.findMany({
    where: { entityType: "ClientService", entityId: id, ...(!showMoney && { action: { notIn: MONEY_ACTIONS } }) },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createClientService(formData: FormData) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const parsed = createSchema.parse({ clientId: formData.get("clientId"), ...readFields(formData) });
    const { clientId, teamUserIds, ...fields } = parsed;

    const service = await prisma.clientService.create({
      data: {
        ...toData({ ...fields, teamUserIds }),
        clientId,
        createdById: session.user.id,
        team: { create: teamUserIds.map((userId) => ({ userId })) },
      },
    });

    await recordAudit({
      entityType: "Client",
      entityId: clientId,
      action: "add_client_service",
      actorId: session.user.id,
      newValue: service.name,
    });
    await recordAudit({ entityType: "ClientService", entityId: service.id, action: "create", actorId: session.user.id });
    await applySuggestedClientStatus(clientId, session.user.id);

    revalidateClient(clientId);
    return { id: service.id };
  });
}

export async function updateClientService(id: string, formData: FormData) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const parsed = updateSchema.parse(readFields(formData));

    const before = await prisma.clientService.findUniqueOrThrow({
      where: { id },
      include: { team: { select: { userId: true } } },
    });
    const service = await prisma.$transaction(async (tx) => {
      await tx.clientServiceAssignee.deleteMany({ where: { clientServiceId: id } });
      return tx.clientService.update({
        where: { id },
        data: {
          ...toData(parsed),
          team: { create: parsed.teamUserIds.map((userId) => ({ userId })) },
        },
      });
    });

    const { team: beforeTeam, ...beforeFields } = before;
    await recordFieldChanges({
      entityType: "ClientService",
      entityId: id,
      actorId: session.user.id,
      action: "update",
      before: { ...beforeFields, assignedUserIds: beforeTeam.map((t) => t.userId).sort() },
      after: { ...service, assignedUserIds: [...parsed.teamUserIds].sort() },
    });

    if (before.status !== service.status) {
      await recordAudit({
        entityType: "Client",
        entityId: service.clientId,
        action: "change_service_status",
        actorId: session.user.id,
        oldValue: `${service.name}:${before.status}`,
        newValue: `${service.name}:${service.status}`,
      });
      await applySuggestedClientStatus(service.clientId, session.user.id);
    } else {
      await recordAudit({
        entityType: "Client",
        entityId: service.clientId,
        action: "update_client_service",
        actorId: session.user.id,
        newValue: service.name,
      });
    }

    revalidateClient(service.clientId);
    revalidatePath(`/clients/${service.clientId}/services/${id}`);
    return { id };
  });
}

// The quick status change from the services table's row menu — same audit
// trail and client-status suggestion as a full edit.
export async function setClientServiceStatus(id: string, status: (typeof SERVICE_STATUSES)[number]) {
  return toActionResult(async () => {
    const session = await requireRole([...MANAGE_ROLES]);
    const next = z.enum(SERVICE_STATUSES).parse(status);
    const before = await prisma.clientService.findUniqueOrThrow({ where: { id } });
    if (before.status === next) return { id };

    const service = await prisma.clientService.update({ where: { id }, data: { status: next } });
    await recordAudit({
      entityType: "ClientService",
      entityId: id,
      action: "update",
      actorId: session.user.id,
      field: "status",
      oldValue: before.status,
      newValue: next,
    });
    await recordAudit({
      entityType: "Client",
      entityId: service.clientId,
      action: "change_service_status",
      actorId: session.user.id,
      oldValue: `${service.name}:${before.status}`,
      newValue: `${service.name}:${next}`,
    });
    await applySuggestedClientStatus(service.clientId, session.user.id);

    revalidateClient(service.clientId);
    revalidatePath(`/clients/${service.clientId}/services/${id}`);
    return { id };
  });
}

// Archive, never delete — invoices/tasks/files filed under a service keep
// pointing at it (their history would otherwise silently fall back to
// "General").
export async function archiveClientService(id: string) {
  return toActionResult(async () => {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const service = await prisma.clientService.update({ where: { id }, data: { active: false } });
    await recordAudit({ entityType: "ClientService", entityId: id, action: "archive", actorId: session.user.id });
    await recordAudit({
      entityType: "Client",
      entityId: service.clientId,
      action: "archive_client_service",
      actorId: session.user.id,
      oldValue: service.name,
    });
    await applySuggestedClientStatus(service.clientId, session.user.id);
    revalidateClient(service.clientId);
    return { id };
  });
}

export async function restoreClientService(id: string) {
  return toActionResult(async () => {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const service = await prisma.clientService.update({ where: { id }, data: { active: true } });
    await recordAudit({ entityType: "ClientService", entityId: id, action: "restore", actorId: session.user.id });
    await recordAudit({
      entityType: "Client",
      entityId: service.clientId,
      action: "restore_client_service",
      actorId: session.user.id,
      newValue: service.name,
    });
    await applySuggestedClientStatus(service.clientId, session.user.id);
    revalidateClient(service.clientId);
    return { id };
  });
}

export type ActivityContext = { label: string; href?: string };

/**
 * The client's whole history in one feed (PDF §7): the client's own audit
 * trail plus what happened on its services, their tasks and — for the
 * invoice roles only — its invoices, each tagged with what it's about.
 * Entries that would just repeat an event already logged on the client
 * (a service being created/archived or changing status) are left out.
 */
export async function getClientActivity(clientId: string, opts: { includeInvoices: boolean; take?: number }) {
  await requireRole([...MANAGE_ROLES]);
  const [services, invoices] = await Promise.all([
    prisma.clientService.findMany({
      where: { clientId },
      select: { id: true, name: true, tasks: { select: { id: true, label: true } } },
    }),
    opts.includeInvoices
      ? prisma.invoice.findMany({
          where: { clientId },
          select: { id: true, seq: true, stripeInvoiceNumber: true, invoiceNumber: true },
        })
      : Promise.resolve([]),
  ]);

  const contexts = new Map<string, ActivityContext>();
  for (const s of services) {
    contexts.set(`ClientService:${s.id}`, { label: s.name, href: `/clients/${clientId}/services/${s.id}` });
    for (const t of s.tasks) {
      contexts.set(`Task:${t.id}`, { label: `${s.name} · ${t.label}`, href: `/clients/${clientId}/services/${s.id}?tab=tasks` });
    }
  }
  for (const i of invoices) {
    contexts.set(`Invoice:${i.id}`, { label: `Invoice ${displayInvoiceNumber(i)}`, href: `/invoices/${i.id}` });
  }
  const idsOf = (type: string) =>
    [...contexts.keys()].filter((k) => k.startsWith(`${type}:`)).map((k) => k.slice(type.length + 1));

  const entries = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Client", entityId: clientId },
        {
          entityType: "ClientService",
          entityId: { in: idsOf("ClientService") },
          action: { notIn: ["create", "archive", "restore", ...(opts.includeInvoices ? [] : MONEY_ACTIONS)] },
          // field is null on event rows (adjustments) — SQL's NOT would
          // drop those along with the status rows.
          OR: [{ field: null }, { field: { not: "status" } }],
        },
        { entityType: "Task", entityId: { in: idsOf("Task") } },
        ...(opts.includeInvoices ? [{ entityType: "Invoice", entityId: { in: idsOf("Invoice") } }] : []),
      ],
    },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 300,
  });
  return entries.map((e) => ({
    ...e,
    context: e.entityType === "Client" ? null : (contexts.get(`${e.entityType}:${e.entityId}`) ?? null),
  }));
}
