"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { RuleRow } from "@/lib/activity-data";
import {
  createProductivityRule,
  deleteProductivityRule,
  loadStarterRules,
  setProductivityRuleEnabled,
  updateProductivityRule,
  type RuleInput,
} from "@/lib/actions/activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CATEGORY_LABEL, CATEGORY_TONE, formatSeconds } from "@/components/activity/format";
import { cn } from "@/lib/utils";

type MatchType = RuleRow["matchType"];
type Category = RuleRow["category"];

const MATCH_LABEL: Record<MatchType, string> = { APP: "App", DOMAIN: "Website", TITLE_CONTAINS: "Window title contains" };
const MATCH_HINT: Record<MatchType, string> = {
  APP: "The app's name or file, e.g. Code, Code.exe, EXCEL",
  DOMAIN: "e.g. github.com (also matches its subdomains). On Windows this falls back to the site's name in the window title.",
  TITLE_CONTAINS: "Any text in the window title, e.g. Figma or Jira",
};
const TRACKED_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "MANAGER", "STAFF"] as const;

export type Unclassified = { label: string; app: string; domain: string | null; seconds: number; users: number; titles: { title: string; seconds: number }[] };

type Draft = {
  id: string | null;
  matchType: MatchType;
  pattern: string;
  category: Category;
  scope: "GLOBAL" | "ROLE" | "USER";
  roles: string[];
  userId: string;
  priority: string;
  enabled: boolean;
};

const EMPTY: Draft = { id: null, matchType: "APP", pattern: "", category: "PRODUCTIVE", scope: "GLOBAL", roles: [], userId: "", priority: "0", enabled: true };

function fromRule(r: RuleRow): Draft {
  return {
    id: r.id,
    matchType: r.matchType,
    pattern: r.pattern,
    category: r.category,
    scope: r.userId ? "USER" : r.roles.length ? "ROLE" : "GLOBAL",
    roles: r.roles,
    userId: r.userId ?? "",
    priority: String(r.priority),
    enabled: r.enabled,
  };
}

function scopeLabel(r: RuleRow) {
  if (r.userName) return r.userName;
  if (r.roles.length) return r.roles.map((x) => x.toLowerCase()).join(", ");
  return "Everyone";
}

export function RulesManager({ rules, unclassified, users }: { rules: RuleRow[]; unclassified: Unclassified[]; users: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(success);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  function save() {
    if (!draft) return;
    const input: RuleInput = {
      matchType: draft.matchType,
      pattern: draft.pattern,
      category: draft.category,
      roles: draft.scope === "ROLE" ? (draft.roles as RuleInput["roles"]) : [],
      userId: draft.scope === "USER" ? draft.userId || null : null,
      priority: Number(draft.priority || 0),
      enabled: draft.enabled,
    };
    if (draft.scope === "USER" && !input.userId) return toast.error("Pick a person");
    if (draft.scope === "ROLE" && !input.roles?.length) return toast.error("Pick at least one role");
    startTransition(async () => {
      try {
        if (draft.id) await updateProductivityRule(draft.id, input);
        else await createProductivityRule(input);
        toast.success("Rule saved");
        setDraft(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save rule");
      }
    });
  }

  function classify(app: Unclassified) {
    setDraft({ ...EMPTY, matchType: app.domain ? "DOMAIN" : "APP", pattern: app.domain ?? app.app });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDraft({ ...EMPTY })}>
          <Plus /> Add rule
        </Button>
        <Button
          variant="outline"
          loading={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                const { added } = await loadStarterRules();
                toast.success(added ? `Added ${added} starter rules` : "Starter rules are already loaded");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load starter rules");
              }
            })
          }
        >
          Load starter rules
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Match</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Applies to</TableHead>
            <TableHead>On</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow key={r.id} className={cn(!r.enabled && "opacity-50")}>
              <TableCell>
                <div className="font-medium">{r.pattern}</div>
                <div className="text-xs text-muted-foreground">
                  {MATCH_LABEL[r.matchType]}
                  {r.priority !== 0 && ` · priority ${r.priority}`}
                </div>
              </TableCell>
              <TableCell>
                <span className={cn("rounded px-1.5 py-0.5 text-xs", CATEGORY_TONE[r.category])}>{CATEGORY_LABEL[r.category]}</span>
              </TableCell>
              <TableCell>{scopeLabel(r)}</TableCell>
              <TableCell>
                <Checkbox
                  checked={r.enabled}
                  disabled={isPending}
                  aria-label="Rule on"
                  onCheckedChange={(c) => run(() => setProductivityRuleEnabled(r.id, c === true), c ? "Rule turned on" : "Rule turned off")}
                />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <Button variant="ghost" size="icon-sm" aria-label="Edit rule" onClick={() => setDraft(fromRule(r))}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete rule"
                  onClick={() => confirm(`Delete the rule for "${r.pattern}"?`) && run(() => deleteProductivityRule(r.id), "Rule deleted")}
                >
                  <Trash2 />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rules.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No rules yet. Everything counts as Neutral with no thinking-time credit. Load the starter rules to begin.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Unclassified apps and sites</h2>
        <p className="text-sm text-muted-foreground">Used in the last 7 days with no rule covering them. They count as Neutral.</p>
        {unclassified.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing unclassified.</p>
        ) : (
          <ul className="divide-y text-sm">
            {unclassified.map((a) => (
              <li key={`${a.domain ?? ""}-${a.app}`} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    {a.label} {a.domain && <Badge variant="outline">site</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatSeconds(a.seconds)} · {a.users} {a.users === 1 ? "person" : "people"}
                    {a.titles[0] && ` · ${a.titles[0].title}`}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => classify(a)}>
                  Classify
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit rule" : "New rule"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Match on</Label>
                  <Select value={draft.matchType} onValueChange={(v) => setDraft({ ...draft, matchType: (v ?? draft.matchType) as MatchType })}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: MatchType) => MATCH_LABEL[v]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MATCH_LABEL) as MatchType[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {MATCH_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: (v ?? draft.category) as Category })}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{(v: Category) => CATEGORY_LABEL[v]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-pattern">Pattern</Label>
                <Input id="rule-pattern" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} required />
                <p className="text-xs text-muted-foreground">{MATCH_HINT[draft.matchType]}</p>
              </div>
              <div className="space-y-1">
                <Label>Applies to</Label>
                <Select value={draft.scope} onValueChange={(v) => setDraft({ ...draft, scope: (v ?? draft.scope) as Draft["scope"] })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: Draft["scope"]) => ({ GLOBAL: "Everyone", ROLE: "Some roles", USER: "One person" })[v]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GLOBAL">Everyone</SelectItem>
                    <SelectItem value="ROLE">Some roles</SelectItem>
                    <SelectItem value="USER">One person</SelectItem>
                  </SelectContent>
                </Select>
                {draft.scope === "ROLE" && (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {TRACKED_ROLES.map((role) => (
                      <label key={role} className="flex items-center gap-1.5 text-sm">
                        <Checkbox
                          checked={draft.roles.includes(role)}
                          onCheckedChange={(c) => setDraft({ ...draft, roles: c ? [...draft.roles, role] : draft.roles.filter((x) => x !== role) })}
                        />
                        {role.toLowerCase()}
                      </label>
                    ))}
                  </div>
                )}
                {draft.scope === "USER" && (
                  <Select value={draft.userId} onValueChange={(v) => setDraft({ ...draft, userId: v ?? "" })}>
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Pick a person">{(v: string) => users.find((u) => u.id === v)?.name ?? "Pick a person"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">A rule for one person beats a role rule, which beats an everyone rule.</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rule-priority">Priority</Label>
                <Input id="rule-priority" type="number" min={-100} max={100} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} className="w-24" />
                <p className="text-xs text-muted-foreground">When two rules of the same reach match, the higher number wins.</p>
              </div>
              <Button type="submit" className="w-full" loading={isPending}>
                Save rule
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
