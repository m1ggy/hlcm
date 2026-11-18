import { z } from "zod";
import { db } from "@/lib/db";
import { UserFacingError } from "@/lib/user-facing-error";
import { agentJson, authenticateAgent } from "@/lib/agent-auth";
import { assertWithinSession, ownedAgentEntry } from "@/lib/agent-sessions";

const MAX_INTERVAL_SEC = 31 * 60;

// No keyboard or mouse data is accepted or stored (scope v2); fields an
// older app still sends are dropped by the schema.
const app = z.object({
  app: z.string().max(200),
  exe: z.string().max(200).optional(),
  title: z.string().max(500),
  domain: z.string().max(253).optional(),
  seconds: z.number().int().min(0).max(MAX_INTERVAL_SEC),
});

const interval = z.object({
  clientId: z.string().min(1).max(64),
  timeEntryId: z.string().min(1).max(64),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  apps: z.array(app).max(300),
});

// Batched, since the app flushes its offline queue in one go after a
// connection drop. Each interval is accepted or rejected on its own, so one
// bad row doesn't wedge the queue; the app drops rejected ones (they will
// never succeed) and retries only on a network or 5xx failure.
const body = z.object({ intervals: z.array(z.unknown()).min(1).max(50) });

export async function POST(request: Request) {
  return agentJson(async () => {
    const ctx = await authenticateAgent(request);
    const { intervals } = body.parse(await request.json());

    const accepted: string[] = [];
    const rejected: { clientId: string | null; error: string }[] = [];

    for (const raw of intervals) {
      const parsed = interval.safeParse(raw);
      if (!parsed.success) {
        const clientId = (raw as { clientId?: unknown })?.clientId;
        rejected.push({ clientId: typeof clientId === "string" ? clientId : null, error: parsed.error.issues[0]?.message ?? "Invalid interval" });
        continue;
      }
      const row = parsed.data;
      try {
        const start = new Date(row.start);
        const end = new Date(row.end);
        const lengthSec = (end.getTime() - start.getTime()) / 1000;
        if (lengthSec <= 0 || lengthSec > MAX_INTERVAL_SEC) throw new UserFacingError("Interval length out of range");

        const entry = await ownedAgentEntry(ctx, row.timeEntryId);
        assertWithinSession(entry, start, end);

        // Idempotent on (device, clientId): a retried upload is a no-op.
        const saved = await db.activityInterval.upsert({
          where: { deviceId_clientId: { deviceId: ctx.device.id, clientId: row.clientId } },
          update: {},
          create: {
            userId: ctx.user.id,
            timeEntryId: entry.id,
            deviceId: ctx.device.id,
            clientId: row.clientId,
            start,
            end,
            apps: row.apps.map(({ app, exe, title, domain, seconds }) => ({ app, exe, title, domain, seconds })),
          },
        });
        // Screenshots usually upload before their interval closes; link any
        // that landed inside this one.
        await db.screenshot.updateMany({
          where: { timeEntryId: entry.id, intervalId: null, takenAt: { gte: start, lte: end } },
          data: { intervalId: saved.id },
        });
        accepted.push(row.clientId);
      } catch (error) {
        if (!(error instanceof UserFacingError)) throw error;
        rejected.push({ clientId: row.clientId, error: error.message });
      }
    }
    return { accepted, rejected };
  });
}
