"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { recordAudit } from "@/lib/audit";
import { toActionResult } from "@/lib/action-result";
import { MANAGE_ROLES } from "@/lib/invoice-shared";
import { formatMoney } from "@/lib/time-entries";

// Credits and charges on a ClientService's balance (see ServiceAdjustment in
// prisma/schema.prisma). Money, so the same invoice-only roles as
// src/lib/actions/invoices.ts. Logged on the service's own history.

const adjustmentSchema = z.object({
  kind: z.enum(["CREDIT", "CHARGE"]),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reason: z.string().trim().min(1, "Reason is required"),
  date: z.string().min(1, "Date is required"),
});

function describe(adjustment: { amount: number; reason: string }) {
  const kind = adjustment.amount < 0 ? "Credit" : "Charge";
  return `${kind} ${formatMoney(Math.abs(adjustment.amount))} — ${adjustment.reason}`;
}

export async function listServiceAdjustments(clientServiceId: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.serviceAdjustment.findMany({
    where: { clientServiceId },
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
  });
}

// Every adjustment across one client's services — what the client page's
// totals and the reports fold into each service's outstanding balance.
export async function listClientAdjustments(clientId: string) {
  await requireRole(MANAGE_ROLES);
  return prisma.serviceAdjustment.findMany({
    where: { clientService: { clientId } },
    select: { id: true, clientServiceId: true, amount: true },
  });
}

export async function createServiceAdjustment(clientServiceId: string, input: z.input<typeof adjustmentSchema>) {
  return toActionResult(async () => {
    const session = await requireRole(MANAGE_ROLES);
    const parsed = adjustmentSchema.parse(input);
    const service = await prisma.clientService.findUniqueOrThrow({
      where: { id: clientServiceId },
      select: { id: true, clientId: true },
    });

    const adjustment = await prisma.serviceAdjustment.create({
      data: {
        clientServiceId,
        amount: parsed.kind === "CREDIT" ? -parsed.amount : parsed.amount,
        reason: parsed.reason,
        date: new Date(parsed.date),
        createdById: session.user.id,
      },
    });
    await recordAudit({
      entityType: "ClientService",
      entityId: clientServiceId,
      action: "add_adjustment",
      actorId: session.user.id,
      newValue: describe(adjustment),
    });

    revalidatePath(`/clients/${service.clientId}`);
    revalidatePath(`/clients/${service.clientId}/services/${clientServiceId}`);
    return { id: adjustment.id };
  });
}

export async function deleteServiceAdjustment(id: string) {
  return toActionResult(async () => {
    const session = await requireRole(MANAGE_ROLES);
    const adjustment = await prisma.serviceAdjustment.delete({
      where: { id },
      include: { clientService: { select: { clientId: true } } },
    });
    await recordAudit({
      entityType: "ClientService",
      entityId: adjustment.clientServiceId,
      action: "remove_adjustment",
      actorId: session.user.id,
      oldValue: describe(adjustment),
    });

    revalidatePath(`/clients/${adjustment.clientService.clientId}`);
    revalidatePath(`/clients/${adjustment.clientService.clientId}/services/${adjustment.clientServiceId}`);
  });
}
