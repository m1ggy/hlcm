import { currentOrganization, db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { DEFAULT_TIMEZONE } from "@/lib/time-entries";
import { UserFacingError } from "@/lib/user-facing-error";
import type { EodActor } from "@/lib/eod";

/** The signed-in person as an EOD author: their own timezone, else the workspace's. */
export async function eodActor(): Promise<EodActor> {
  const session = await requireSession();
  const [org, me] = await Promise.all([
    currentOrganization(),
    db.user.findUnique({ where: { id: session.user.id }, select: { timezone: true } }),
  ]);
  if (org.kind === "TASKS") throw new UserFacingError("End-of-day reports live in your own company's workspace");
  return { userId: session.user.id, role: session.user.role, timeZone: me?.timezone || org.timezone || DEFAULT_TIMEZONE };
}

