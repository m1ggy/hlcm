import { test } from "node:test";
import assert from "node:assert/strict";
import { idleThresholdSec, ruleMatches, sortRules, winningRule, type AgentRule } from "./rules";

function rule(partial: Partial<AgentRule>): AgentRule {
  return { id: "r", matchType: "APP", pattern: "", category: "NEUTRAL", idleGraceMin: null, priority: 0, scope: "GLOBAL", ...partial };
}

test("APP matches the app name or exe, with or without .exe", () => {
  const vscode = rule({ pattern: "Code.exe" });
  assert.equal(ruleMatches(vscode, { app: "Visual Studio Code", exe: "Code.exe", title: "" }), true);
  assert.equal(ruleMatches(vscode, { app: "Code", title: "" }), true);
  assert.equal(ruleMatches(vscode, { app: "Codex", exe: "codex.exe", title: "" }), false);
});

test("DOMAIN matches subdomains, and falls back to the title without a URL", () => {
  const gh = rule({ matchType: "DOMAIN", pattern: "github.com" });
  assert.equal(ruleMatches(gh, { app: "Chrome", title: "", domain: "gist.github.com" }), true);
  assert.equal(ruleMatches(gh, { app: "Chrome", title: "", domain: "notgithub.com" }), false);
  assert.equal(ruleMatches(gh, { app: "Chrome", title: "Pull requests · GitHub - Google Chrome" }), true);
  assert.equal(ruleMatches(rule({ matchType: "DOMAIN", pattern: "x.com" }), { app: "Chrome", title: "box" }), false);
});

test("TITLE_CONTAINS is a case-insensitive substring", () => {
  assert.equal(ruleMatches(rule({ matchType: "TITLE_CONTAINS", pattern: "figma" }), { app: "Chrome", title: "Design – Figma" }), true);
});

test("user scope beats role beats global, then priority, then match type", () => {
  const sorted = sortRules([
    rule({ id: "global-app", pattern: "Code", idleGraceMin: 30 }),
    rule({ id: "global-title", matchType: "TITLE_CONTAINS", pattern: "a.ts", idleGraceMin: 20 }),
    rule({ id: "role", scope: "ROLE", pattern: "Code", idleGraceMin: 45 }),
    rule({ id: "user", scope: "USER", pattern: "Code", idleGraceMin: null }),
  ]);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["user", "role", "global-title", "global-app"]
  );
  const sample = { app: "Code", title: "a.ts" };
  assert.equal(winningRule(sorted, sample)?.id, "user");
  // Winning rule has no grace: default applies.
  assert.equal(idleThresholdSec(sorted, sample, 15), 15 * 60);
  assert.equal(idleThresholdSec(sorted.slice(1), sample, 15), 45 * 60);
});
