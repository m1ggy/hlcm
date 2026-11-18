import path from "node:path";
import { randomUUID } from "node:crypto";
import { powerMonitor } from "electron";
import { buildIntervals, domainOf, INTERVAL_MS, MAX_TICK_MS, TICK_MS, type Tick } from "./activity";
import { NoInputWatch } from "./idle";
import { captureScreens } from "./capture";
import type { QueueItem } from "./queue";

// Runs only while this device's session is open on the server. Every 5 s
// it records which window is in front; every 30 min it closes an interval
// and queues it; once per 30-min window it takes a screenshot at a random
// moment. It reads the OS idle time only to clock the person out after the
// no-input limit (2 hours) — never keyboard or mouse input itself
// (docs/activity-monitoring-plan.md, scope v2).

export type Session = { timeEntryId: string; clockIn: number };

export type TrackerEvents = {
  enqueue: (item: QueueItem) => void;
  /** No input for the limit: clock out at `since`, when input stopped. */
  noInput: (since: number) => void;
  screenshotTaken: (at: number) => void;
  log: (message: string) => void;
};

type WindowSample = { app: string; exe?: string; title: string; domain?: string };

type GetWindows = typeof import("get-windows");
let getWindows: Promise<GetWindows> | null = null;

async function sampleWindow(): Promise<WindowSample> {
  try {
    getWindows ??= import("get-windows");
    const win = await (await getWindows).activeWindow();
    if (!win) return { app: "Unknown", title: "" };
    return {
      app: win.owner.name || "Unknown",
      exe: win.owner.path ? path.basename(win.owner.path) : undefined,
      title: win.title ?? "",
      domain: win.platform === "macos" ? domainOf(win.url) : undefined,
    };
  } catch {
    return { app: "Unknown", title: "" };
  }
}

export class Tracker {
  private session: Session | null = null;
  private ticks: Tick[] = [];
  private sliceStart = 0;
  private lastTickAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private watch = new NoInputWatch();
  private noInputLimitSec = 120 * 60;
  private windowIndex = -1;
  private shotAt = 0;
  private shotTaken = false;

  constructor(private events: TrackerEvents) {}

  get tracking(): Session | null {
    return this.session;
  }

  /** From the server's clock state (autoClockOutIdleMinutes). */
  setNoInputLimit(minutes: number) {
    if (Number.isFinite(minutes) && minutes > 0) this.noInputLimitSec = minutes * 60;
  }

  start(session: Session) {
    if (this.session?.timeEntryId === session.timeEntryId) return;
    if (this.session) this.stop();
    this.session = session;
    const now = Date.now();
    this.sliceStart = Math.max(session.clockIn, now - MAX_TICK_MS);
    this.lastTickAt = this.sliceStart;
    this.ticks = [];
    this.watch.reset();
    this.windowIndex = -1;
    this.planWindow(now);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.events.log(`tracker: started ${session.timeEntryId}`);
  }

  /**
   * Flushes everything up to `endAt` (default now) and stops. Ticks after
   * endAt are dropped: that time is no longer part of the session.
   */
  stop(endAt = Date.now()) {
    if (!this.session) return;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ticks = this.ticks.filter((tick) => tick.t <= endAt);
    this.flush(Math.max(endAt, this.sliceStart));
    this.events.log(`tracker: stopped ${this.session.timeEntryId}`);
    this.session = null;
    this.watch.reset();
  }

  private planWindow(now: number) {
    const session = this.session!;
    const index = Math.floor((now - session.clockIn) / INTERVAL_MS);
    if (index === this.windowIndex) return;
    this.windowIndex = index;
    const windowStart = session.clockIn + index * INTERVAL_MS;
    // Random moment in what's left of this window (the first window may
    // start before the app did, e.g. after a restart mid-session).
    const from = Math.max(windowStart, now);
    this.shotAt = from + Math.random() * (windowStart + INTERVAL_MS - from);
    this.shotTaken = false;
  }

  private async tick() {
    if (this.ticking || !this.session) return;
    this.ticking = true;
    try {
      const now = Date.now();
      const since = this.watch.update(now, powerMonitor.getSystemIdleTime(), this.noInputLimitSec);
      if (since !== null) {
        this.events.noInput(Math.max(since, this.session.clockIn));
        return;
      }

      const sample = await sampleWindow();
      if (!this.session) return;
      const sec = Math.min(now - this.lastTickAt, MAX_TICK_MS) / 1000;
      this.lastTickAt = now;
      this.ticks.push({ t: now, sec, ...sample });

      if (!this.shotTaken && now >= this.shotAt) {
        this.shotTaken = true;
        void this.takeScreenshot();
      }
      const windowEnd = this.session.clockIn + (this.windowIndex + 1) * INTERVAL_MS;
      if (now >= windowEnd) this.flush(now);
      this.planWindow(now);
    } catch (error) {
      this.events.log(`tracker: tick failed ${(error as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private flush(end: number) {
    const session = this.session;
    if (!session || end - this.sliceStart < 1000) return;
    const intervals = buildIntervals(this.ticks, { timeEntryId: session.timeEntryId, start: this.sliceStart, end, newId: randomUUID });
    this.ticks = this.ticks.filter((tick) => tick.t > end);
    this.sliceStart = end;
    if (intervals.length) this.events.enqueue({ kind: "intervals", body: { intervals } });
  }

  private async takeScreenshot() {
    const session = this.session;
    if (!session) return;
    try {
      const takenAt = Date.now();
      const captures = await captureScreens();
      captures.forEach((capture, index) => {
        this.events.enqueue({
          kind: "screenshot",
          meta: {
            clientId: randomUUID(),
            timeEntryId: session.timeEntryId,
            takenAt: new Date(takenAt).toISOString(),
            monitors: captures.length,
            monitorIndex: index,
          },
          image: capture.image.toString("base64"),
          thumb: capture.thumb.toString("base64"),
        });
      });
      this.events.screenshotTaken(takenAt);
    } catch (error) {
      this.events.log(`tracker: screenshot failed ${(error as Error).message}`);
    }
  }
}
