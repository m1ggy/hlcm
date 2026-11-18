import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIntervals, domainOf, INTERVAL_MS, type Tick } from "./activity";

const T0 = Date.parse("2026-10-30T14:00:00Z");
let n = 0;
const newId = () => `id${++n}`;

function tick(offsetSec: number, extra: Partial<Tick> = {}): Tick {
  return { t: T0 + offsetSec * 1000, sec: 5, keys: 0, mouse: 0, active: false, idle: false, app: "Code", title: "a.ts", ...extra };
}

test("sums counts and active/idle seconds per interval", () => {
  const ticks = [
    tick(5, { keys: 3, active: true }),
    tick(10, { mouse: 2, active: true }),
    tick(15),
    tick(20, { idle: true }),
    tick(25, { idle: true, active: true }), // idle wins over active
  ];
  const [interval] = buildIntervals(ticks, { timeEntryId: "e1", start: T0, end: T0 + 30_000, decisionFor: () => null, newId });
  assert.equal(interval.keyCount, 3);
  assert.equal(interval.mouseCount, 2);
  assert.equal(interval.activeSec, 10);
  assert.equal(interval.idleSec, 10);
  assert.equal(interval.start, new Date(T0).toISOString());
  assert.equal(interval.end, new Date(T0 + 30_000).toISOString());
  assert.deepEqual(interval.apps, [{ app: "Code", title: "a.ts", seconds: 25, activeSeconds: 10 }]);
});

test("splits a long held slice into 30-minute chunks", () => {
  const end = T0 + INTERVAL_MS * 2 + 10 * 60_000;
  const ticks = [tick(60, { active: true }), tick(INTERVAL_MS / 1000 + 60, { active: true }), tick((2 * INTERVAL_MS) / 1000 + 60)];
  const intervals = buildIntervals(ticks, { timeEntryId: "e1", start: T0, end, decisionFor: () => null, newId });
  assert.equal(intervals.length, 3);
  assert.deepEqual(
    intervals.map((i) => (Date.parse(i.end) - Date.parse(i.start)) / 60_000),
    [30, 30, 10]
  );
  assert.deepEqual(
    intervals.map((i) => i.activeSec),
    [5, 5, 0]
  );
});

test("active + idle never exceed the interval length", () => {
  const ticks = Array.from({ length: 10 }, (_, i) => tick(i + 1, { sec: 10, active: true }));
  const [interval] = buildIntervals(ticks, { timeEntryId: "e1", start: T0, end: T0 + 10_000, decisionFor: () => null, newId });
  assert.equal(interval.activeSec + interval.idleSec <= 10, true);
});

test("passes each chunk to decisionFor", () => {
  const seen: number[] = [];
  buildIntervals([], {
    timeEntryId: "e1",
    start: T0,
    end: T0 + INTERVAL_MS + 60_000,
    decisionFor: (s) => {
      seen.push(s);
      return "KEPT";
    },
    newId,
  });
  assert.deepEqual(seen, [T0, T0 + INTERVAL_MS]);
});

test("groups apps by app + title + domain and caps the list", () => {
  const ticks = Array.from({ length: 310 }, (_, i) => tick(i + 1, { sec: 1, title: `t${i}` }));
  const [interval] = buildIntervals(ticks, { timeEntryId: "e1", start: T0, end: T0 + 400_000, decisionFor: () => null, newId });
  assert.equal(interval.apps.length, 300);
  assert.equal(interval.apps.at(-1)?.app, "Other");
  assert.equal(
    interval.apps.reduce((s, a) => s + a.seconds, 0),
    310
  );
});

test("domainOf keeps only the bare domain", () => {
  assert.equal(domainOf("https://www.github.com/org/repo?token=secret"), "github.com");
  assert.equal(domainOf("https://docs.google.com/document/d/123"), "docs.google.com");
  assert.equal(domainOf("not a url"), undefined);
  assert.equal(domainOf(undefined), undefined);
});
