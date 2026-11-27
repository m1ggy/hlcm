// Productivity scoring for the desktop tracker's activity intervals, done on
// read so editing a rule re-scores history. Pure (no prisma/server imports)
// so pages, server actions and scripts can all share it.
//
// Scope v2 (docs/activity-monitoring-plan.md): category only — no keyboard
// or mouse data, so no activity % or bias. Productivity % = time in apps a
// rule marks Productive / time tracked.

export type MatchType = "APP" | "DOMAIN" | "TITLE_CONTAINS";
export type Category = "PRODUCTIVE" | "NEUTRAL" | "UNPRODUCTIVE";
export type RuleScope = "USER" | "ROLE" | "GLOBAL";

export type ScoringRule = {
  id: string;
  matchType: MatchType;
  pattern: string;
  category: Category;
  priority: number;
  enabled: boolean;
  roles: string[];
  /** Specific people; non-empty makes it a USER-scope rule. */
  userIds: string[];
};

type ScopedRule = ScoringRule & { scope: RuleScope };

/** One row of ActivityInterval.apps. */
export type AppUsage = { app: string; exe?: string; title: string; domain?: string; seconds: number };

export type IntervalInput = {
  start: Date;
  end: Date;
  apps: AppUsage[];
};

const SCOPE_RANK = { USER: 3, ROLE: 2, GLOBAL: 1 } as const;
const MATCH_RANK = { DOMAIN: 3, TITLE_CONTAINS: 2, APP: 1 } as const;

function stripExe(name: string) {
  return name.toLowerCase().replace(/\.exe$/, "");
}

type Window = Pick<AppUsage, "app" | "exe" | "title" | "domain">;

export function ruleMatches(rule: Pick<ScoringRule, "matchType" | "pattern">, usage: Window): boolean {
  const pattern = rule.pattern.trim().toLowerCase();
  if (!pattern) return false;
  switch (rule.matchType) {
    case "APP": {
      const wanted = stripExe(pattern);
      return stripExe(usage.app) === wanted || (!!usage.exe && stripExe(usage.exe) === wanted);
    }
    case "TITLE_CONTAINS":
      return usage.title.toLowerCase().includes(pattern);
    case "DOMAIN": {
      if (usage.domain) {
        const domain = usage.domain.toLowerCase();
        return domain === pattern || domain.endsWith(`.${pattern}`);
      }
      // No URL from the OS (Windows): fall back to the site's name in the
      // window title, e.g. "github.com" matches "Pull requests · GitHub".
      const label = pattern.split(".")[0];
      return label.length >= 3 && usage.title.toLowerCase().includes(label);
    }
  }
}

/**
 * The enabled rules that apply to one user, most specific first: their own
 * rules, then their role's, then global ones; within a scope by priority,
 * then match type (DOMAIN > TITLE_CONTAINS > APP).
 */
export function rulesForUser(rules: ScoringRule[], user: { id: string; role: string }): ScopedRule[] {
  return rules
    .filter((r) => r.enabled && (r.userIds.length === 0 || r.userIds.includes(user.id)) && (r.roles.length === 0 || r.roles.includes(user.role)))
    .map((r): ScopedRule => ({ ...r, scope: r.userIds.length ? "USER" : r.roles.length ? "ROLE" : "GLOBAL" }))
    .sort(
      (a, b) =>
        SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope] || b.priority - a.priority || MATCH_RANK[b.matchType] - MATCH_RANK[a.matchType]
    );
}

export function winningRule(sortedRules: ScopedRule[], usage: Window): ScopedRule | null {
  return sortedRules.find((rule) => ruleMatches(rule, usage)) ?? null;
}

export type Score = {
  /** Interval length in seconds (clipped to the session). */
  trackedSec: number;
  productiveSec: number;
  unproductiveSec: number;
};

export const EMPTY_SCORE: Score = { trackedSec: 0, productiveSec: 0, unproductiveSec: 0 };

export function addScores(a: Score, b: Score): Score {
  return {
    trackedSec: a.trackedSec + b.trackedSec,
    productiveSec: a.productiveSec + b.productiveSec,
    unproductiveSec: a.unproductiveSec + b.unproductiveSec,
  };
}

/** 0–100, or null when there's nothing tracked. */
export function percent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

/**
 * Clips an interval to its session. The 2-hour no-input clock-out is
 * back-dated, so an interval already uploaded can run past it; app seconds
 * are scaled down by the share of the interval that's kept.
 */
export function clipInterval(interval: IntervalInput, session: { clockIn: Date; clockOut: Date | null }, now = new Date()): IntervalInput | null {
  const sessionEnd = session.clockOut ?? now;
  const start = new Date(Math.max(interval.start.getTime(), session.clockIn.getTime()));
  const end = new Date(Math.min(interval.end.getTime(), sessionEnd.getTime()));
  const fullMs = interval.end.getTime() - interval.start.getTime();
  const keptMs = end.getTime() - start.getTime();
  if (keptMs <= 0 || fullMs <= 0) return null;
  if (keptMs === fullMs) return interval;
  const share = keptMs / fullMs;
  const scale = (n: number) => Math.round(n * share);
  return { ...interval, start, end, apps: interval.apps.map((a) => ({ ...a, seconds: scale(a.seconds) })) };
}

/** Scores one (already clipped) interval against a user's sorted rules. */
export function scoreInterval(interval: IntervalInput, sortedRules: ScopedRule[]): Score {
  const trackedSec = Math.max(0, Math.round((interval.end.getTime() - interval.start.getTime()) / 1000));
  let productiveSec = 0;
  let unproductiveSec = 0;
  for (const usage of interval.apps) {
    const rule = winningRule(sortedRules, usage);
    if (!rule) continue;
    if (rule.category === "PRODUCTIVE") productiveSec += usage.seconds;
    if (rule.category === "UNPRODUCTIVE") unproductiveSec += usage.seconds;
  }
  return {
    trackedSec,
    productiveSec: Math.min(trackedSec, productiveSec),
    unproductiveSec: Math.min(trackedSec, unproductiveSec),
  };
}

export type AppTotal = {
  /** App name, or the site's domain when the app reported one. */
  label: string;
  app: string;
  exe: string | null;
  domain: string | null;
  seconds: number;
  category: Category;
  ruleId: string | null;
  /** Busiest window titles for this app, longest first. */
  titles: { title: string; seconds: number }[];
};

/** Per-app (or per-site) totals across intervals, longest first. */
export function appTotals(intervals: IntervalInput[], sortedRules: ScopedRule[], maxTitles = 5): AppTotal[] {
  const byKey = new Map<string, AppTotal & { titleMap: Map<string, number> }>();
  for (const interval of intervals) {
    for (const usage of interval.apps) {
      const domain = usage.domain?.toLowerCase() || null;
      const key = domain ? `d:${domain}` : `a:${usage.app.toLowerCase()}`;
      let total = byKey.get(key);
      if (!total) {
        total = { label: domain ?? usage.app, app: usage.app, exe: usage.exe ?? null, domain, seconds: 0, category: "NEUTRAL", ruleId: null, titles: [], titleMap: new Map() };
        byKey.set(key, total);
      }
      if (!total.exe && usage.exe) total.exe = usage.exe;
      total.seconds += usage.seconds;
      if (usage.title) total.titleMap.set(usage.title, (total.titleMap.get(usage.title) ?? 0) + usage.seconds);
    }
  }
  const result: AppTotal[] = [];
  for (const { titleMap, ...total } of byKey.values()) {
    const titles = [...titleMap.entries()].sort((a, b) => b[1] - a[1]).map(([title, seconds]) => ({ title, seconds }));
    // Category of the app/site as a whole: the rule matching its busiest title.
    const rule = winningRule(sortedRules, { app: total.app, exe: total.exe ?? undefined, domain: total.domain ?? undefined, title: titles[0]?.title ?? "" });
    result.push({ ...total, category: rule?.category ?? "NEUTRAL", ruleId: rule?.id ?? null, titles: titles.slice(0, maxTitles) });
  }
  return result.sort((a, b) => b.seconds - a.seconds);
}

/** Starter rules from the plan (section 7). Offered as a one-click load on the rules page. */
export const STARTER_RULES: Omit<ScoringRule, "id" | "enabled" | "roles" | "userIds" | "priority">[] = [
  { matchType: "APP", pattern: "Code", category: "PRODUCTIVE" },
  { matchType: "TITLE_CONTAINS", pattern: "Visual Studio Code", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "Zoom", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "zoom.us", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "Microsoft Teams", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "ms-teams", category: "PRODUCTIVE" },
  { matchType: "TITLE_CONTAINS", pattern: "Google Meet", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "EXCEL", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "Microsoft Excel", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "WINWORD", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "Microsoft Word", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "OUTLOOK", category: "PRODUCTIVE" },
  { matchType: "APP", pattern: "Microsoft Outlook", category: "PRODUCTIVE" },
  { matchType: "DOMAIN", pattern: "youtube.com", category: "UNPRODUCTIVE" },
  { matchType: "DOMAIN", pattern: "facebook.com", category: "UNPRODUCTIVE" },
  { matchType: "DOMAIN", pattern: "instagram.com", category: "UNPRODUCTIVE" },
  { matchType: "DOMAIN", pattern: "tiktok.com", category: "UNPRODUCTIVE" },
];
