import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";

// Local-disk file pool. `storageKey` is a filename inside this dir — good
// enough for the single-droplet deploy target; swap for S3-style storage
// later without touching callers if we move to multi-instance hosting.
// Overridable via UPLOAD_DIR — in local dev, point this outside the project
// root: Turbopack's file watcher treats any write under the project root as
// a change worth reacting to, and reacting mid-request has been observed to
// interrupt an in-flight router.refresh() and knock the client back to the
// nearest resolvable route. Production's default (unset) matches the
// `hclm_uploads` volume mount in docker-compose.yml — do not change it there.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "storage", "uploads");

export async function saveUploadedFile(file: File): Promise<{ storageKey: string; sizeBytes: number }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name);
  const storageKey = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, storageKey), buffer);
  return { storageKey, sizeBytes: buffer.byteLength };
}

export async function saveBuffer(buffer: Buffer, ext: string): Promise<{ storageKey: string; sizeBytes: number }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const storageKey = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, storageKey), buffer);
  return { storageKey, sizeBytes: buffer.byteLength };
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(path.join(UPLOAD_DIR, storageKey));
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  await unlink(path.join(UPLOAD_DIR, storageKey)).catch(() => {});
}
