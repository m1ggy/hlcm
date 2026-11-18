import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIntervals, domainOf, INTERVAL_MS, type Tick } from "./activity";

const T0 = Date.parse("2026-10-30T14:00:00Z");
let n = 0;
const newId = () => `id${++n}`;

function tick(offsetSec: number, extra: Partial<Tick> = {}): Tick {
  return { t: T0 + offsetSec * 1000, sec: 5, app: "Code", title: "a.ts", ...extra };
}

test("sums app time per interval, with no keyboard or mouse fields", () => {
  const ticks = [tick(5), tick(10), tick(15, { app: "Chrome", title: "Inbox", domain: "mail.google.com" })];
  const [interval] = buildIntervals(ticks, { timeEntryId: "e1", start: T0, end: T0 + 30_000, newId });
  assert.equal(interval.start, new Date(T0).toISOString());
  assert.equal(interval.end, new Date(T0 + 30_000).toISOString());
  assert.deepEqual(interval.apps, [
    { app: "Code", title: "a.ts", seconds: 10 },
    { app: "Chrome", title: "Inbox", domain: "mail.google.com", seconds: 5 },
  ]);
  assert.deepEqual(Object.keys(interval).sort(), ["apps", "clientId", "end", "start", "timeEntryId"]);
});

test("splits a long slice into 30-minute chunks", () => {
  const end = T0 + INTERVAL_MS * 2 + 10 * 60_000;
  const ticks = [tick(60), tick(INTERVAL_MS / 1000 + 60), tick((2 * INTERVAL_MS) / 1000 + 60)];
  const intervals = buildIntervals(ticks, { timeEntryId: "e1", start: T0, end, newId });
  assert.deepEqual(
    intervals.map((i) => (Date.parse(i.end) - Date.parse(i.start)) / 60_000),
    [30, 30, 10]
  );
  assert.deepEqual(
    intervals.map((i) => i.apps[0]?.seconds),
    [5, 5, 5]
  );
});

test("groups apps by app + title + domain and caps the list", () => {
  const ticks = Array.from({ length: 310 }, (_, i) => tick(i + 1, { sec: 1, title: `t${i}` }));
  const [interval] = buildIntervals(ticks, { timeEntryId: "e1", start: T0, end: T0 + 400_000, newId });
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
