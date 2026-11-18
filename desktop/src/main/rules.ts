// Productivity rule matching for the focused window. The app only uses it
// for idle grace; scoring happens server-side. Keep the matching semantics
// in sync with the server's scorer (Phase 3), see
// docs/activity-monitoring-plan.md section 7. Unit-tested in rules.test.ts.

export type AgentRule = {
  id: string;
  matchType: "APP" | "DOMAIN" | "TITLE_CONTAINS";
  pattern: string;
  category: "PRODUCTIVE" | "NEUTRAL" | "UNPRODUCTIVE";
  idleGraceMin: number | null;
  priority: number;
  scope: "USER" | "ROLE" | "GLOBAL";
};

export type WindowSample = { app: string; exe?: string; title: string; domain?: string };

const SCOPE_RANK = { USER: 3, ROLE: 2, GLOBAL: 1 } as const;
const MATCH_RANK = { DOMAIN: 3, TITLE_CONTAINS: 2, APP: 1 } as const;

function stripExe(name: string) {
  return name.toLowerCase().replace(/\.exe$/, "");
}

export function ruleMatches(rule: AgentRule, sample: WindowSample): boolean {
  const pattern = rule.pattern.trim().toLowerCase();
  if (!pattern) return false;
  switch (rule.matchType) {
    case "APP": {
      const wanted = stripExe(pattern);
      return stripExe(sample.app) === wanted || (!!sample.exe && stripExe(sample.exe) === wanted);
    }
    case "TITLE_CONTAINS":
      return sample.title.toLowerCase().includes(pattern);
    case "DOMAIN": {
      if (sample.domain) return sample.domain === pattern || sample.domain.endsWith(`.${pattern}`);
      // No URL from the OS (Windows): fall back to the site's name in the
      // window title, e.g. "github.com" matches "Pull requests · GitHub".
      const label = pattern.split(".")[0];
      return label.length >= 3 && sample.title.toLowerCase().includes(label);
    }
  }
}

/** Most specific scope first, then priority, then match type. */
export function sortRules(rules: AgentRule[]): AgentRule[] {
  return [...rules].sort(
    (a, b) =>
      SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope] || b.priority - a.priority || MATCH_RANK[b.matchType] - MATCH_RANK[a.matchType]
  );
}

export function winningRule(sortedRules: AgentRule[], sample: WindowSample): AgentRule | null {
  return sortedRules.find((rule) => ruleMatches(rule, sample)) ?? null;
}

export function idleThresholdSec(sortedRules: AgentRule[], sample: WindowSample, defaultMinutes: number): number {
  const rule = winningRule(sortedRules, sample);
  return (rule?.idleGraceMin ?? defaultMinutes) * 60;
}
