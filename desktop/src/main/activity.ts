// Pure aggregation: turns the tracker's 5-second samples of the focused
// window into the interval payloads POSTed to /api/agent/intervals. No
// keyboard or mouse data exists anywhere in the app (scope v2,
// docs/activity-monitoring-plan.md). No Electron imports, so it is
// unit-tested directly (activity.test.ts).

export const TICK_MS = 5_000;
export const INTERVAL_MS = 30 * 60 * 1000;
// A tick never claims more than this, so a timer stall or sleep can't
// inflate one tick into minutes of app time.
export const MAX_TICK_MS = 2 * TICK_MS;

export type Tick = {
  /** End of the period this tick covers (ms epoch). */
  t: number;
  /** Seconds this tick covers. */
  sec: number;
  app: string;
  /** Executable file name (e.g. "Code.exe"), when the OS reports one. */
  exe?: string;
  title: string;
  domain?: string;
};

export type AppUsage = { app: string; exe?: string; title: string; domain?: string; seconds: number };

export type IntervalPayload = {
  clientId: string;
  timeEntryId: string;
  start: string;
  end: string;
  apps: AppUsage[];
};

const MAX_APPS = 300;

function aggregateApps(ticks: Tick[]): AppUsage[] {
  const byKey = new Map<string, AppUsage>();
  for (const tick of ticks) {
    const key = `${tick.app}\u0000${tick.exe ?? ""}\u0000${tick.title}\u0000${tick.domain ?? ""}`;
    let usage = byKey.get(key);
    if (!usage) {
      usage = { app: tick.app.slice(0, 200), title: tick.title.slice(0, 500), seconds: 0 };
      if (tick.exe) usage.exe = tick.exe.slice(0, 200);
      if (tick.domain) usage.domain = tick.domain.slice(0, 253);
      byKey.set(key, usage);
    }
    usage.seconds += tick.sec;
  }

  let apps = [...byKey.values()].sort((a, b) => b.seconds - a.seconds);
  if (apps.length > MAX_APPS) {
    const rest = apps.slice(MAX_APPS - 1);
    apps = apps.slice(0, MAX_APPS - 1);
    apps.push({ app: "Other", title: "", seconds: rest.reduce((s, a) => s + a.seconds, 0) });
  }
  return apps.map((a) => ({ ...a, seconds: Math.round(a.seconds) }));
}

/**
 * Splits [start, end) into chunks of at most INTERVAL_MS and builds one
 * payload per chunk from the ticks that ended inside it.
 */
export function buildIntervals(
  ticks: Tick[],
  opts: { timeEntryId: string; start: number; end: number; newId: () => string }
): IntervalPayload[] {
  const payloads: IntervalPayload[] = [];
  for (let chunkStart = opts.start; chunkStart < opts.end; chunkStart += INTERVAL_MS) {
    const chunkEnd = Math.min(chunkStart + INTERVAL_MS, opts.end);
    if ((chunkEnd - chunkStart) / 1000 < 1) continue;
    const inChunk = ticks.filter((tick) => tick.t > chunkStart && tick.t <= chunkEnd);
    payloads.push({
      clientId: opts.newId(),
      timeEntryId: opts.timeEntryId,
      start: new Date(chunkStart).toISOString(),
      end: new Date(chunkEnd).toISOString(),
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
