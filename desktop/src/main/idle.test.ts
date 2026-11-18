import { test } from "node:test";
import assert from "node:assert/strict";
import { IdleDetector } from "./idle";

const MIN = 60_000;
const T0 = Date.parse("2026-10-30T14:00:00Z");

test("starts at the last input once the threshold is reached", () => {
  const d = new IdleDetector();
  assert.equal(d.update(T0 + 14 * MIN, 14 * 60, 15 * 60), null);
  assert.deepEqual(d.update(T0 + 15 * MIN, 15 * 60, 15 * 60), { type: "started", start: T0 });
  // Still idle: nothing new.
  assert.equal(d.update(T0 + 20 * MIN, 20 * 60, 15 * 60), null);
});

test("ends at the first input after the stretch began", () => {
  const d = new IdleDetector();
  d.update(T0 + 15 * MIN, 15 * 60, 15 * 60);
  // Input 2 s ago, at T0 + 30 min.
  const event = d.update(T0 + 30 * MIN + 2000, 2, 15 * 60);
  assert.deepEqual(event, { type: "ended", start: T0, end: T0 + 30 * MIN });
  assert.equal(d.idleStart, null);
});

test("idle grace raises the threshold", () => {
  const d = new IdleDetector();
  assert.equal(d.update(T0 + 20 * MIN, 20 * 60, 30 * 60), null);
  assert.equal(d.update(T0 + 30 * MIN, 30 * 60, 30 * 60)?.type, "started");
});

test("sleep opens a stretch even if the OS idle counter reset", () => {
  const d = new IdleDetector();
  assert.deepEqual(d.forceStart(T0), { type: "started", start: T0 });
  // Woke up and typed immediately: idle counter is ~0 but the stretch ends now.
  assert.deepEqual(d.update(T0 + 40 * MIN, 0, 15 * 60), { type: "ended", start: T0, end: T0 + 40 * MIN });
});

test("forceStart doesn't move an open stretch", () => {
  const d = new IdleDetector();
  d.update(T0 + 15 * MIN, 15 * 60, 15 * 60);
  assert.equal(d.forceStart(T0 + 16 * MIN), null);
  assert.equal(d.idleStart, T0);
});
