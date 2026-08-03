import { randomUUID } from "crypto";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { scanForViruses } from "@/lib/clamav";

// GCS-backed file pool. `storageKey` is an object name inside the bucket.
// Auth: GCS_CREDENTIALS_JSON holds the full service-account key as a JSON
// string (env var, not a mounted file — keeps the container image/volume
// free of secrets). Falls back to Application Default Credentials if unset
// (e.g. local dev with `gcloud auth application-default login`).
let bucket: ReturnType<Storage["bucket"]> | null = null;

function getBucket() {
  if (bucket) return bucket;
  const bucketName = process.env.GCS_BUCKET;
  if (!bucketName) throw new Error("GCS_BUCKET env var is required");
  const storage = new Storage(
    process.env.GCS_CREDENTIALS_JSON
      ? { credentials: JSON.parse(process.env.GCS_CREDENTIALS_JSON) }
      : undefined
  );
  bucket = storage.bucket(bucketName);
  return bucket;
}

async function currentGeneration(storageKey: string): Promise<bigint> {
  const [metadata] = await getBucket().file(storageKey).getMetadata();
  return BigInt(metadata.generation!);
}

export async function saveUploadedFile(
  file: File
): Promise<{ storageKey: string; sizeBytes: number; generation: bigint }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  await scanForViruses(buffer);
  const ext = path.extname(file.name);
  const storageKey = `${randomUUID()}${ext}`;
  await getBucket().file(storageKey).save(buffer, { resumable: false, contentType: file.type || undefined });
  return { storageKey, sizeBytes: buffer.byteLength, generation: await currentGeneration(storageKey) };
}

export async function saveBuffer(
  buffer: Buffer,
  ext: string
): Promise<{ storageKey: string; sizeBytes: number; generation: bigint }> {
  const storageKey = `${randomUUID()}${ext}`;
  await getBucket().file(storageKey).save(buffer, { resumable: false });
  return { storageKey, sizeBytes: buffer.byteLength, generation: await currentGeneration(storageKey) };
}

// Overwrites an existing object in place (same storageKey) to record a new
// version of an already-uploaded file. Requires the bucket to have Object
// Versioning enabled — otherwise the previous generation's bytes are gone
// the moment this call succeeds, silently breaking version history.
export async function saveFileVersion(
  storageKey: string,
  buffer: Buffer,
  contentType?: string
): Promise<{ generation: bigint }> {
  await getBucket().file(storageKey).save(buffer, { resumable: false, contentType });
  return { generation: await currentGeneration(storageKey) };
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  const [buffer] = await getBucket().file(storageKey).download();
  return buffer;
}

export async function readStoredFileGeneration(storageKey: string, generation: bigint): Promise<Buffer> {
  const [buffer] = await getBucket().file(storageKey, { generation: generation.toString() }).download();
  return buffer;
}

// Makes an older generation the live object again, by copying its bytes
// onto a brand-new generation of the same storageKey — the old generations
// (including the one just superseded) all stay put. This is what backs
// "revert to this version": nothing is ever deleted, revert just adds a new
// version on top whose content matches the target.
export async function revertToGeneration(storageKey: string, generation: bigint): Promise<{ generation: bigint }> {
  const bucketRef = getBucket();
  const source = bucketRef.file(storageKey, { generation: generation.toString() });
  const dest = bucketRef.file(storageKey);
  await source.copy(dest);
  return { generation: await currentGeneration(storageKey) };
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  await getBucket().file(storageKey).delete().catch(() => {});
}
