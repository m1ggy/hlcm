// Pure aggregation: turns the tracker's 5-second ticks into the interval
// payloads POSTed to /api/agent/intervals. No Electron imports, so it is
// unit-tested directly (activity.test.ts).

export const TICK_MS = 5_000;
export const INTERVAL_MS = 30 * 60 * 1000;
// A tick never claims more than this, so a timer stall or sleep can't
// inflate one tick into minutes of "activity".
export const MAX_TICK_MS = 2 * TICK_MS;

export type Tick = {
  /** End of the period this tick covers (ms epoch). */
  t: number;
  /** Seconds this tick covers. */
  sec: number;
  keys: number;
  mouse: number;
  /** Any keyboard/mouse input during the tick. */
  active: boolean;
  /** Inside an idle stretch past the threshold. */
  idle: boolean;
  app: string;
  /** Executable file name (e.g. "Code.exe"), when the OS reports one. */
  exe?: string;
  title: string;
  domain?: string;
};

export type IdleDecision = "KEPT" | "DISCARDED";

export type AppUsage = { app: string; exe?: string; title: string; domain?: string; seconds: number; activeSeconds: number };

export type IntervalPayload = {
  clientId: string;
  timeEntryId: string;
  start: string;
  end: string;
  keyCount: number;
  mouseCount: number;
  activeSec: number;
  idleSec: number;
  idleDecision: IdleDecision | null;
  apps: AppUsage[];
};

const MAX_APPS = 300;

function aggregateApps(ticks: Tick[]): AppUsage[] {
  const byKey = new Map<string, AppUsage>();
  for (const tick of ticks) {
    const key = `${tick.app}\u0000${tick.exe ?? ""}\u0000${tick.title}\u0000${tick.domain ?? ""}`;
    let usage = byKey.get(key);
    if (!usage) {
      usage = { app: tick.app.slice(0, 200), title: tick.title.slice(0, 500), seconds: 0, activeSeconds: 0 };
      if (tick.exe) usage.exe = tick.exe.slice(0, 200);
      if (tick.domain) usage.domain = tick.domain.slice(0, 253);
      byKey.set(key, usage);
    }
    usage.seconds += tick.sec;
    if (tick.active && !tick.idle) usage.activeSeconds += tick.sec;
  }

  let apps = [...byKey.values()].sort((a, b) => b.seconds - a.seconds);
  if (apps.length > MAX_APPS) {
    const rest = apps.slice(MAX_APPS - 1);
    apps = apps.slice(0, MAX_APPS - 1);
    apps.push({
      app: "Other",
      title: "",
      seconds: rest.reduce((s, a) => s + a.seconds, 0),
      activeSeconds: rest.reduce((s, a) => s + a.activeSeconds, 0),
    });
  }
  return apps.map((a) => {
    const seconds = Math.round(a.seconds);
    return { ...a, seconds, activeSeconds: Math.min(seconds, Math.round(a.activeSeconds)) };
  });
}

/**
 * Splits [start, end) into chunks of at most INTERVAL_MS (a slice held open
 * across an idle prompt can run longer than one interval) and builds one
 * payload per chunk from the ticks that ended inside it.
 */
export function buildIntervals(
  ticks: Tick[],
  opts: {
    timeEntryId: string;
    start: number;
    end: number;
    decisionFor: (chunkStart: number, chunkEnd: number) => IdleDecision | null;
    newId: () => string;
  }
): IntervalPayload[] {
  const payloads: IntervalPayload[] = [];
  for (let chunkStart = opts.start; chunkStart < opts.end; chunkStart += INTERVAL_MS) {
    const chunkEnd = Math.min(chunkStart + INTERVAL_MS, opts.end);
    const lengthSec = (chunkEnd - chunkStart) / 1000;
    if (lengthSec < 1) continue;
    const inChunk = ticks.filter((tick) => tick.t > chunkStart && tick.t <= chunkEnd);

    let activeSec = 0;
    let idleSec = 0;
    let keyCount = 0;
    let mouseCount = 0;
    for (const tick of inChunk) {
      keyCount += tick.keys;
      mouseCount += tick.mouse;
      if (tick.idle) idleSec += tick.sec;
      else if (tick.active) activeSec += tick.sec;
    }
    // Ticks are disjoint, but rounding can still nudge the sum past the
    // chunk length; keep it inside so the server's sanity check holds.
    activeSec = Math.min(Math.round(activeSec), Math.floor(lengthSec));
    idleSec = Math.min(Math.round(idleSec), Math.floor(lengthSec) - activeSec);

    payloads.push({
      clientId: opts.newId(),
      timeEntryId: opts.timeEntryId,
      start: new Date(chunkStart).toISOString(),
      end: new Date(chunkEnd).toISOString(),
      keyCount,
      mouseCount,
      activeSec,
      idleSec,
      idleDecision: opts.decisionFor(chunkStart, chunkEnd),
      apps: aggregateApps(inChunk),
    });
  }
  return payloads;
}

/** Browser URL -> bare domain. Only the domain is ever sent, never the path or query. */
export function domainOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host || undefined;
  } catch {
    return undefined;
  }
}
