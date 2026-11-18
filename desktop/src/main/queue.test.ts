import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { UploadQueue, type QueueItem } from "./queue";
import { ApiError, NetworkError, SignedOutError } from "./api";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hclm-queue-"));
}

const item = (n: number): QueueItem => ({ kind: "intervals", body: { intervals: [{ n }] } });

async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

test("stores items encrypted and uploads them in order", async () => {
  const dir = tempDir();
  const queue = new UploadQueue(dir, randomBytes(32), () => {}, () => {});
  queue.enqueue({ kind: "screenshot", meta: { clientId: "c1" }, image: Buffer.from("SECRET-PIXELS").toString("base64"), thumb: "" });
  queue.enqueue(item(2));
  for (const file of fs.readdirSync(dir)) {
    const raw = fs.readFileSync(path.join(dir, file));
    assert.equal(raw.includes(Buffer.from("SECRET")), false);
    assert.equal(raw.includes(Buffer.from(Buffer.from("SECRET-PIXELS").toString("base64"))), false);
  }

  const sent: QueueItem[] = [];
  queue.setSender(async (i) => {
    sent.push(i);
  });
  await settle();
  assert.deepEqual(
    sent.map((i) => i.kind),
    ["screenshot", "intervals"]
  );
  assert.equal(queue.pendingCount(), 0);
});

test("keeps items while offline, drops ones the server rejects", async () => {
  const dir = tempDir();
  const queue = new UploadQueue(dir, randomBytes(32), () => {}, () => {});
  queue.enqueue(item(1));
  queue.enqueue(item(2));

  queue.setSender(async () => {
    throw new NetworkError("down");
  });
  await settle();
  assert.equal(queue.pendingCount(), 2);

  let calls = 0;
  queue.setSender(async () => {
    calls++;
    if (calls === 1) throw new ApiError(400, "Outside the clocked-in session");
  });
  await settle();
  assert.equal(calls, 2);
  assert.equal(queue.pendingCount(), 0);
});

test("a wrong key can't read the queue", async () => {
  const dir = tempDir();
  new UploadQueue(dir, randomBytes(32), () => {}, () => {}).enqueue(item(1));
  const logs: string[] = [];
  const other = new UploadQueue(dir, randomBytes(32), (m) => logs.push(m), () => {});
  const sent: QueueItem[] = [];
  other.setSender(async (i) => {
    sent.push(i);
  });
  await settle();
  assert.equal(sent.length, 0);
  assert.match(logs[0], /unreadable/);
});

test("signed out stops the queue and keeps items", async () => {
  const dir = tempDir();
  let signedOut = false;
  const queue = new UploadQueue(dir, randomBytes(32), () => {}, () => {
    signedOut = true;
  });
  queue.enqueue(item(1));
  queue.setSender(async () => {
    throw new SignedOutError();
  });
  await settle();
  assert.equal(signedOut, true);
  assert.equal(queue.pendingCount(), 1);
});
