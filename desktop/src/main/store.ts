import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import type { StoredAuth } from "./api";

// Everything secret on disk goes through safeStorage (Windows DPAPI / macOS
// Keychain), so another user account on the machine can't read it.

function userFile(name: string) {
  return path.join(app.getPath("userData"), name);
}

// Writes are chained so two quick token rotations land in order; an
// out-of-order write could restore an already-used refresh token, which the
// server treats as theft and revokes the device.
let writes: Promise<void> = Promise.resolve();

function writeSecret(name: string, value: string): Promise<void> {
  writes = writes
    .catch(() => {})
    .then(async () => {
      const encrypted = await safeStorage.encryptStringAsync(value);
      const file = userFile(name);
      fs.writeFileSync(`${file}.tmp`, encrypted);
      fs.renameSync(`${file}.tmp`, file);
    });
  return writes;
}

async function readSecret(name: string): Promise<string | null> {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(userFile(name));
  } catch {
    return null;
  }
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(raw);
    if (shouldReEncrypt) await writeSecret(name, result);
    return result;
  } catch {
    return null;
  }
}

export async function loadAuth(): Promise<StoredAuth | null> {
  const raw = await readSecret("auth.bin");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

export function saveAuth(auth: StoredAuth): Promise<void> {
  return writeSecret("auth.bin", JSON.stringify(auth));
}

export async function clearAuth() {
  await writes.catch(() => {});
  fs.rmSync(userFile("auth.bin"), { force: true });
}

/** 32-byte key for the upload queue, created on first run. */
export async function queueKey(): Promise<Buffer> {
  const existing = await readSecret("queue.key");
  if (existing) return Buffer.from(existing, "base64");
  const key = randomBytes(32);
  await writeSecret("queue.key", key.toString("base64"));
  return key;
}

type Settings = { serverUrl?: string };

export function loadSettings(): Settings {
  try {
    return JSON.parse(fs.readFileSync(userFile("settings.json"), "utf8")) as Settings;
  } catch {
    return {};
  }
}

export function saveSettings(settings: Settings) {
  fs.writeFileSync(userFile("settings.json"), JSON.stringify(settings, null, 2));
}

/** Server URL baked in at build time (agent/config.json); can be overridden at sign-in. */
export function defaultServerUrl(): string {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(app.getAppPath(), "config.json"), "utf8")) as { defaultServerUrl?: string };
    return config.defaultServerUrl ?? "";
  } catch {
    return "";
  }
}

/** Plain-text log with no window titles, screenshots or other activity content. */
export function log(message: string) {
  try {
    const dir = app.getPath("logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "tracker.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break tracking.
  }
}
