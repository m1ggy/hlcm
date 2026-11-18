import { db } from "@/lib/db";
import { UserFacingError } from "@/lib/user-facing-error";
import type { AgentContext } from "@/lib/agent-auth";

// Clock skew allowed between the desktop app's timestamps and the server's.
export const CLOCK_SKEW_MS = 60 * 1000;

/**
 * The AGENT session an upload claims to belong to. It must be this user's,
 * opened by this same device: a second laptop can't attach activity to a
 * session it isn't tracking. May already be closed (offline queue catch-up).
 */
export async function ownedAgentEntry(ctx: AgentContext, timeEntryId: string) {
  const entry = await db.timeEntry.findUnique({
    where: { id: timeEntryId },
    select: { id: true, userId: true, source: true, agentDeviceId: true, clockIn: true, clockOut: true },
  });
  if (!entry || entry.userId !== ctx.user.id || entry.source !== "AGENT" || entry.agentDeviceId !== ctx.device.id) {
    throw new UserFacingError("That session isn't tracked by this device");
  }
  return entry;
}

/** Throws unless [start, end] sits inside the session, give or take clock skew. */
export function assertWithinSession(entry: { clockIn: Date; clockOut: Date | null }, start: Date, end: Date) {
  const sessionEnd = entry.clockOut ?? new Date();
  if (start.getTime() < entry.clockIn.getTime() - CLOCK_SKEW_MS || end.getTime() > sessionEnd.getTime() + CLOCK_SKEW_MS) {
    throw new UserFacingError("Outside the clocked-in session");
  }
}
