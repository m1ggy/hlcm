import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { suggestClientStatus } from "@/lib/service-status";
import { UserFacingError } from "@/lib/user-facing-error";

// Plain helpers shared by the server actions that link a record to a
// ClientService — kept out of the "use server" files since every export
// there becomes a directly-callable action.

/**
 * Reads an optional service id off a form/input and checks it belongs to
 * `clientId` — an invoice/task/file can only be filed under one of its own
 * client's services. "" / null / undefined all mean "no service" (General).
 */
export async function resolveClientServiceId(
  raw: FormDataEntryValue | string | null | undefined,
  clientId: string | null | undefined
): Promise<string | null> {
  if (typeof raw !== "string" || raw === "") return null;
  const service = await prisma.clientService.findUnique({ where: { id: raw }, select: { clientId: true } });
  if (!service || !clientId || service.clientId !== clientId) {
    throw new UserFacingError("That service doesn't belong to this client");
  }
  return raw;
}

/**
 * After one of a client's services changed status (or was archived),
 * moves the client to the status suggestClientStatus picks, if any, and
 * logs it as an automatic change. Returns the new status, or null if
 * nothing changed.
 */
export async function applySuggestedClientStatus(clientId: string, actorId: string) {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { status: true, services: { select: { status: true, active: true } } },
  });
  const next = suggestClientStatus(client.status, client.services);
  if (!next) return null;

  await prisma.client.update({ where: { id: clientId }, data: { status: next } });
  await recordAudit({
    entityType: "Client",
    entityId: clientId,
    action: "auto_status",
    actorId,
    field: "status",
    oldValue: client.status,
    newValue: next,
  });
  return next;
}
