import { db } from "@/lib/db";
import { deleteStoredFileAllVersions } from "@/lib/storage";

// Desktop-tracker data is kept 90 days (docs/activity-monitoring-plan.md):
// screenshots (images + rows) and activity intervals older than that are
// deleted. Time entries are payroll records and stay. Runs per workspace
// (instrumentation.ts). Images live under each workspace's org/{orgId}/
// folder, so removing a workspace removes them too.

export const ACTIVITY_RETENTION_DAYS = 90;
const BATCH = 200;

export async function purgeOldActivity(now = new Date()) {
  const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let screenshots = 0;

  for (;;) {
    const batch = await db.screenshot.findMany({
      where: { takenAt: { lt: cutoff } },
      select: { id: true, storageKey: true, thumbKey: true, deletedAt: true },
      take: BATCH,
    });
    if (batch.length === 0) break;
    // Images first: if this run dies midway the rows are still there to retry.
    await Promise.all(batch.filter((s) => !s.deletedAt).flatMap((s) => [deleteStoredFileAllVersions(s.storageKey), deleteStoredFileAllVersions(s.thumbKey)]));
    const { count } = await db.screenshot.deleteMany({ where: { id: { in: batch.map((s) => s.id) } } });
    screenshots += count;
    if (batch.length < BATCH) break;
  }

  const { count: intervals } = await db.activityInterval.deleteMany({ where: { end: { lt: cutoff } } });
  return { screenshots, intervals, cutoff };
}
