import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isRetryable, SignedOutError } from "./api";

// Offline upload queue. Every interval batch and screenshot is written to
// disk first (AES-256-GCM, key protected by the OS keychain via Electron's
// safeStorage, passed in as `key`), then uploaded in order. Screenshots can
// show client PHI, so nothing is ever stored in plain text.
//
// Upload outcomes: success -> delete; retryable (offline, 5xx, 429) -> stop
// and back off; any other error -> the server will never accept it, drop it
// (logged, without contents).

export type QueueItem =
  | { kind: "intervals"; body: { intervals: unknown[] } }
  | { kind: "screenshot"; meta: Record<string, unknown>; image: string; thumb: string }; // base64 JPEG

export type Sender = (item: QueueItem) => Promise<void>;

const MIN_BACKOFF_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;

export class UploadQueue {
  private draining = false;
  private backoffMs = MIN_BACKOFF_MS;
  private timer: NodeJS.Timeout | null = null;
  private send: Sender | null = null;

  constructor(
    private dir: string,
    private key: Buffer,
    private log: (message: string) => void,
    private onSignedOut: () => void
  ) {
    fs.mkdirSync(dir, { recursive: true });
  }

  setSender(send: Sender | null) {
    this.send = send;
    if (send) this.kick();
  }

  enqueue(item: QueueItem) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(item), "utf8"), cipher.final()]);
    const file = path.join(this.dir, `${Date.now().toString().padStart(15, "0")}-${randomUUID()}.bin`);
    // Write-then-rename so a crash mid-write never leaves a half item.
    fs.writeFileSync(`${file}.tmp`, Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
    fs.renameSync(`${file}.tmp`, file);
    this.kick();
  }

  pendingCount() {
    return this.files().length;
  }

  private files() {
    return fs
      .readdirSync(this.dir)
      .filter((name) => name.endsWith(".bin"))
      .sort();
  }

  private read(file: string): QueueItem | null {
    try {
      const raw = fs.readFileSync(path.join(this.dir, file));
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
    } catch {
      return null;
    }
  }

  /** Try to upload now (after enqueue, coming back online, or sign-in). */
  kick() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    void this.drain();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
  }

  private async drain() {
    if (this.draining || !this.send) return;
    this.draining = true;
    try {
      for (const file of this.files()) {
        const item = this.read(file);
        if (!item) {
          this.log(`queue: unreadable item ${file} dropped`);
          fs.rmSync(path.join(this.dir, file), { force: true });
          continue;
        }
        try {
          await this.send(item);
        } catch (error) {
          if (error instanceof SignedOutError) {
            this.onSignedOut();
            return;
          }
          if (isRetryable(error)) {
            this.schedule();
            return;
          }
          this.log(`queue: ${item.kind} rejected (${(error as Error).message}), dropped`);
        }
        fs.rmSync(path.join(this.dir, file), { force: true });
      }
      this.backoffMs = MIN_BACKOFF_MS;
    } finally {
      this.draining = false;
    }
  }

  /** Sign-out on this machine: queued data belongs to the old session. */
  clear() {
    for (const file of this.files()) fs.rmSync(path.join(this.dir, file), { force: true });
  }
}
