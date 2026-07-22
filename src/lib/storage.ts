import { randomUUID } from "crypto";
import path from "path";
import { mkdir, writeFile, readFile, unlink } from "fs/promises";

// Local-disk file pool. `storageKey` is a filename inside this dir — good
// enough for the single-droplet deploy target; swap for S3-style storage
// later without touching callers if we move to multi-instance hosting.
const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");

export async function saveUploadedFile(file: File): Promise<{ storageKey: string; sizeBytes: number }> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name);
  const storageKey = `${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, storageKey), buffer);
  return { storageKey, sizeBytes: buffer.byteLength };
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(path.join(UPLOAD_DIR, storageKey));
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  await unlink(path.join(UPLOAD_DIR, storageKey)).catch(() => {});
}
