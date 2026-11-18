import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

// The desktop app heartbeats every minute while it runs. A session it
// opened that has gone silent this long (app killed, laptop closed, network
// down) is closed at its last heartbeat, so the clock can't run on with
// nobody tracked. Runs per workspace (instrumentation.ts).
export const AGENT_SILENCE_LIMIT_MS = 15 * 60 * 1000;

export async function closeSilentAgentSessions(now = new Date()) {
  const cutoff = new Date(now.getTime() - AGENT_SILENCE_LIMIT_MS);
  const silent = await db.timeEntry.findMany({
    where: {
      source: "AGENT",
      clockOut: null,
      OR: [{ lastHeartbeatAt: { lt: cutoff } }, { lastHeartbeatAt: null, clockIn: { lt: cutoff } }],
    },
    select: { id: true, userId: true, clockIn: true, lastHeartbeatAt: true },
  });

  for (const entry of silent) {
    const clockOut = entry.lastHeartbeatAt ?? entry.clockIn;
    // Guarded on clockOut still null, in case the app reconnected and the
    // user clocked out between the read above and this write.
    const { count } = await db.timeEntry.updateMany({
      where: { id: entry.id, clockOut: null },
      data: { clockOut, autoClosed: true },
    });
    if (count === 0) continue;
    // No system user exists, so the audit row is attributed to the session's
    // owner; the action name marks it as automatic.
    await recordAudit({
      entityType: "TimeEntry",
      entityId: entry.id,
      action: "auto_clock_out_no_heartbeat",
      actorId: entry.userId,
      newValue: clockOut,
    });
  }
  return silent.length;
}
