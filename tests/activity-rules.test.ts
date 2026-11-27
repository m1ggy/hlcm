import { describe, expect, it } from "vitest";
import { rulesForUser, winningRule, type ScoringRule } from "@/lib/activity-scoring";

const base = { matchType: "APP" as const, pattern: "slack", priority: 0, enabled: true, roles: [], userIds: [] };
const rules: ScoringRule[] = [
  { ...base, id: "everyone", category: "UNPRODUCTIVE" },
  { ...base, id: "staff", category: "NEUTRAL", roles: ["STAFF"] },
  { ...base, id: "people", category: "PRODUCTIVE", userIds: ["ana", "ben"] },
];
const usage = { app: "Slack", title: "general" };

describe("app rules for several people", () => {
  it("applies to each named person, ahead of role and everyone rules", () => {
    expect(winningRule(rulesForUser(rules, { id: "ana", role: "STAFF" }), usage)?.id).toBe("people");
    expect(winningRule(rulesForUser(rules, { id: "ben", role: "MANAGER" }), usage)?.id).toBe("people");
  });

  it("skips people not named", () => {
    expect(winningRule(rulesForUser(rules, { id: "cy", role: "STAFF" }), usage)?.id).toBe("staff");
    expect(winningRule(rulesForUser(rules, { id: "di", role: "MANAGER" }), usage)?.id).toBe("everyone");
  });
});
