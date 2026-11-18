import path from "node:path";
import { randomUUID } from "node:crypto";
import { powerMonitor } from "electron";
import { uIOhook } from "uiohook-napi";
import { buildIntervals, domainOf, INTERVAL_MS, MAX_TICK_MS, TICK_MS, type IdleDecision, type Tick } from "./activity";
import { IdleDetector } from "./idle";
import { idleThresholdSec, sortRules, type AgentRule, type WindowSample } from "./rules";
import { captureScreens } from "./capture";
import type { QueueItem } from "./queue";

// Runs only while this device's session is open on the server. Every 5 s
// it records input counts, the focused window and idle state; every 30 min
// it closes an interval and queues it; once per 30-min window it takes a
// screenshot at a random moment. An idle stretch holds the interval open
// until the user answers the idle prompt, so "No, I wasn't working" can
// still cut the session back to when the stretch began.

export type Session = { timeEntryId: string; clockIn: number };

type IdleStretch = { start: number; end: number; decision: IdleDecision };

const HOLD_WHEN_QUIET_SEC = 60;

export type TrackerEvents = {
  enqueue: (item: QueueItem) => void;
  /** User came back from an idle stretch: ask whether it was work. */
  idleEnded: (start: number, end: number) => void;
  screenshotTaken: (at: number) => void;
  log: (message: string) => void;
};

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
  private keys = 0;
  private mouse = 0;
  private moved = false;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private detector = new IdleDetector();
  private pendingIdle: { start: number; end: number } | null = null;
  private stretches: IdleStretch[] = [];
  private windowIndex = -1;
  private shotAt = 0;
  private shotTaken = false;
  private rules: AgentRule[] = [];
  private defaultIdleMinutes = 15;
  private hookStarted = false;

  constructor(private events: TrackerEvents) {
    uIOhook.on("keydown", () => this.keys++);
    uIOhook.on("mousedown", () => this.mouse++);
    uIOhook.on("wheel", () => this.mouse++);
    // Mouse moves fire hundreds of times a second; count at most one per tick.
    uIOhook.on("mousemove", () => {
      this.moved = true;
    });
    powerMonitor.on("suspend", () => {
      if (this.session) this.detector.forceStart(Date.now());
    });
  }

  get tracking(): Session | null {
    return this.session;
  }

  get idlePending() {
    return this.pendingIdle;
  }

  /** In an idle stretch or waiting on the idle prompt. */
  get inIdle() {
    return this.detector.idleStart !== null || this.pendingIdle !== null;
  }

  setRules(rules: AgentRule[], defaultIdleMinutes: number) {
    this.rules = sortRules(rules);
    this.defaultIdleMinutes = defaultIdleMinutes;
  }

  start(session: Session) {
    if (this.session?.timeEntryId === session.timeEntryId) return;
    if (this.session) this.stop();
    this.session = session;
    const now = Date.now();
    this.sliceStart = Math.max(session.clockIn, now - MAX_TICK_MS);
    this.lastTickAt = this.sliceStart;
    this.ticks = [];
    this.stretches = [];
    this.pendingIdle = null;
    this.detector.reset();
    this.keys = this.mouse = 0;
    this.moved = false;
    this.windowIndex = -1;
    this.planWindow(now);
    if (!this.hookStarted) {
      uIOhook.start();
      this.hookStarted = true;
    }
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
    if (this.hookStarted) {
      uIOhook.stop();
      this.hookStarted = false;
    }
    this.ticks = this.ticks.filter((tick) => tick.t <= endAt);
    this.flush(Math.max(endAt, this.sliceStart));
    this.events.log(`tracker: stopped ${this.session.timeEntryId}`);
    this.session = null;
    this.pendingIdle = null;
    this.detector.reset();
  }

  /** The user's answer to the idle prompt. Returns the idle start for a discard. */
  resolveIdle(decision: IdleDecision): number | null {
    const pending = this.pendingIdle;
    if (!pending) return null;
    this.pendingIdle = null;
    this.stretches.push({ ...pending, decision });
    if (decision === "DISCARDED") return pending.start;
    this.maybeFlush(Date.now());
    return null;
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
      const sample = await sampleWindow();
      if (!this.session) return;

      const keys = this.keys;
      const mouse = this.mouse + (this.moved ? 1 : 0);
      this.keys = this.mouse = 0;
      this.moved = false;

      const thresholdSec = idleThresholdSec(this.rules, sample, this.defaultIdleMinutes);
      const event = this.detector.update(now, powerMonitor.getSystemIdleTime(), thresholdSec);
      if (event?.type === "started") {
        // The quiet minutes before detection were idle too.
        for (const tick of this.ticks) if (tick.t > event.start) tick.idle = true;
      } else if (event?.type === "ended") {
        this.pendingIdle = { start: event.start, end: event.end };
        for (const tick of this.ticks) if (tick.t > event.start && tick.t <= event.end) tick.idle = true;
        this.events.idleEnded(event.start, event.end);
      }

      const sec = Math.min(now - this.lastTickAt, MAX_TICK_MS) / 1000;
      this.lastTickAt = now;
      this.ticks.push({
        t: now,
        sec,
        keys,
        mouse,
        active: keys + mouse > 0,
        idle: this.detector.idleStart !== null,
        app: sample.app,
        exe: sample.exe,
        title: sample.title,
        domain: sample.domain,
      });

      if (!this.shotTaken && now >= this.shotAt) {
        this.shotTaken = true;
        void this.takeScreenshot();
      }
      this.maybeFlush(now);
      this.planWindow(now);
    } catch (error) {
      this.events.log(`tracker: tick failed ${(error as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private maybeFlush(now: number) {
    if (!this.session || this.inIdle) return;
    // Already quiet at the boundary: this may turn into an idle stretch
    // that starts inside the slice, so hold it until input resumes.
    if (powerMonitor.getSystemIdleTime() >= HOLD_WHEN_QUIET_SEC) return;
    const windowEnd = this.session.clockIn + (this.windowIndex + 1) * INTERVAL_MS;
    if (now >= windowEnd) this.flush(now);
  }

  private flush(end: number) {
    const session = this.session;
    if (!session || end - this.sliceStart < 1000) return;
    const intervals = buildIntervals(this.ticks, {
      timeEntryId: session.timeEntryId,
      start: this.sliceStart,
      end,
      newId: randomUUID,
      decisionFor: (chunkStart, chunkEnd) => {
        const overlapping = this.stretches.filter((s) => s.start < chunkEnd && s.end > chunkStart);
        if (overlapping.some((s) => s.decision === "DISCARDED")) return "DISCARDED";
        return overlapping.length ? "KEPT" : null;
      },
    });
    this.ticks = this.ticks.filter((tick) => tick.t > end);
    this.stretches = this.stretches.filter((s) => s.end > end);
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
