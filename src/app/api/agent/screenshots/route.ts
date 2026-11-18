import { randomUUID } from "crypto";
import { z } from "zod";
import { db, currentOrgId } from "@/lib/db";
import { UserFacingError } from "@/lib/user-facing-error";
import { agentJson, authenticateAgent } from "@/lib/agent-auth";
import { assertWithinSession, ownedAgentEntry } from "@/lib/agent-sessions";
import { deleteStoredFile, saveBufferAt } from "@/lib/storage";

// multipart/form-data: `meta` (JSON below), `image` (full screenshot) and
// `thumb` (small preview the app resizes itself, so the server needs no
// image library). Stored under the workspace's own folder,
// org/{orgId}/screenshots/{userId}/{date}/, so removing a workspace removes
// them too; the daily purge (src/lib/activity-retention.ts) deletes them
// after 90 days.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_THUMB_BYTES = 1024 * 1024;

const meta = z.object({
  clientId: z.string().min(1).max(64),
  timeEntryId: z.string().min(1).max(64),
  takenAt: z.iso.datetime(),
  monitors: z.number().int().min(1).max(16).default(1),
});

function imageType(buffer: Buffer): { ext: string; contentType: string } | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: ".jpg", contentType: "image/jpeg" };
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: ".png", contentType: "image/png" };
  }
  return null;
}

async function readImage(form: FormData, field: string, maxBytes: number) {
  const file = form.get(field);
  if (!(file instanceof File)) throw new UserFacingError(`Missing ${field}`);
  if (file.size > maxBytes) throw new UserFacingError(`${field} is too large`);
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = imageType(buffer);
  if (!type) throw new UserFacingError(`${field} must be a JPEG or PNG`);
  return { buffer, ...type };
}

export async function POST(request: Request) {
  return agentJson(async () => {
    const ctx = await authenticateAgent(request);
    const form = await request.formData();
    let rawMeta: unknown;
    try {
      rawMeta = JSON.parse(String(form.get("meta") ?? ""));
    } catch {
      throw new UserFacingError("meta must be JSON");
    }
    const input = meta.parse(rawMeta);

    const existing = await db.screenshot.findUnique({
      where: { deviceId_clientId: { deviceId: ctx.device.id, clientId: input.clientId } },
      select: { id: true },
    });
    if (existing) return { id: existing.id };

    const takenAt = new Date(input.takenAt);
    const entry = await ownedAgentEntry(ctx, input.timeEntryId);
    assertWithinSession(entry, takenAt, takenAt);

    const [image, thumb] = await Promise.all([readImage(form, "image", MAX_IMAGE_BYTES), readImage(form, "thumb", MAX_THUMB_BYTES)]);

    const day = takenAt.toISOString().slice(0, 10);
    const base = `org/${await currentOrgId()}/screenshots/${ctx.user.id}/${day}/${randomUUID()}`;
    const storageKey = `${base}${image.ext}`;
    const thumbKey = `${base}-thumb${thumb.ext}`;
    await Promise.all([
      saveBufferAt(storageKey, image.buffer, image.contentType),
      saveBufferAt(thumbKey, thumb.buffer, thumb.contentType),
    ]);

    const interval = await db.activityInterval.findFirst({
      where: { timeEntryId: entry.id, start: { lte: takenAt }, end: { gte: takenAt } },
      select: { id: true },
    });

    try {
      const shot = await db.screenshot.create({
        data: {
          userId: ctx.user.id,
          timeEntryId: entry.id,
          intervalId: interval?.id ?? null,
          deviceId: ctx.device.id,
          clientId: input.clientId,
          storageKey,
          thumbKey,
          takenAt,
          monitors: input.monitors,
        },
        select: { id: true },
      });
      return { id: shot.id };
    } catch (error) {
      // Lost a race with a concurrent retry of the same upload: keep theirs,
      // drop our copy of the files.
      await Promise.all([deleteStoredFile(storageKey), deleteStoredFile(thumbKey)]);
      const winner = await db.screenshot.findUnique({
        where: { deviceId_clientId: { deviceId: ctx.device.id, clientId: input.clientId } },
        select: { id: true },
      });
      if (winner) return { id: winner.id };
      throw error;
    }
  });
}
