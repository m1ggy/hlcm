import { test } from "node:test";
import assert from "node:assert/strict";
import { NoInputWatch } from "./idle";

const MIN = 60_000;
const T0 = Date.parse("2026-10-30T14:00:00Z");
const LIMIT = 120 * 60;

test("fires once, at the moment input stopped, when the limit is reached", () => {
  const w = new NoInputWatch();
  assert.equal(w.update(T0 + 119 * MIN, 119 * 60, LIMIT), null);
  assert.equal(w.update(T0 + 120 * MIN, 120 * 60, LIMIT), T0);
  // Still no input: doesn't fire again.
  assert.equal(w.update(T0 + 130 * MIN, 130 * 60, LIMIT), null);
});

test("input resets it", () => {
  const w = new NoInputWatch();
  w.update(T0 + 120 * MIN, 120 * 60, LIMIT);
  assert.equal(w.update(T0 + 121 * MIN, 0, LIMIT), null);
  assert.equal(w.update(T0 + 241 * MIN, 120 * 60, LIMIT), T0 + 121 * MIN);
});
