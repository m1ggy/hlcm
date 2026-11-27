"use client";

import { Building2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

// EOD lines grouped by the company they're for: a CRM client, a client
// workspace (work-task lines), or "Other work" for lines with neither. The
// editor and the report view show a rail of companies and one company's
// lines at a time, instead of every company's lines in one long list.

export const OTHER_COMPANY = "other";
export type Company = { key: string; name: string; lines: number; written: number };

type Groupable = { clientId: string | null; clientName: string | null; work: { orgId: string; workspaceName: string } | null };

export function companyOf(line: Groupable): { key: string; name: string } {
  if (line.work) return { key: `w:${line.work.orgId}`, name: line.work.workspaceName };
  if (line.clientId) return { key: `c:${line.clientId}`, name: line.clientName ?? "Client" };
  return { key: OTHER_COMPANY, name: "Other work" };
}

/**
 * Every company with a line (or, in the editor, an open task to add), by
 * name, "Other work" last. `extra` adds companies that have no lines yet.
 */
export function companiesFor(lines: (Groupable & { workDone: string })[], extra: { key: string; name: string }[] = []): Company[] {
  const byKey = new Map<string, Company>();
  for (const l of lines) {
    const c = companyOf(l);
    const row = byKey.get(c.key) ?? { ...c, lines: 0, written: 0 };
    row.lines++;
    if (l.workDone.trim()) row.written++;
    byKey.set(c.key, row);
  }
  for (const c of extra) if (!byKey.has(c.key)) byKey.set(c.key, { ...c, lines: 0, written: 0 });
  return [...byKey.values()].sort((a, b) => Number(a.key === OTHER_COMPANY) - Number(b.key === OTHER_COMPANY) || a.name.localeCompare(b.name));
}

/** The selected company if it still exists, else the first with lines, else the first. */
export function pickCompany(companies: Company[], selected: string | null): string | null {
  if (selected && companies.some((c) => c.key === selected)) return selected;
  return (companies.find((c) => c.lines > 0) ?? companies[0])?.key ?? null;
}

export function CompanyRail({
  companies,
  selected,
  onSelect,
  showWritten,
}: {
  companies: Company[];
  selected: string | null;
  onSelect: (key: string) => void;
  /** Editor: "2/3" lines written. Report view: just the line count. */
  showWritten: boolean;
}) {
  return (
    <nav aria-label="Companies" className="md:sticky md:top-4 md:self-start">
      <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-1 md:overflow-visible md:pb-0">
        {companies.map((c) => {
          const active = c.key === selected;
          const Icon = c.key === OTHER_COMPANY ? Inbox : Building2;
          const done = showWritten && c.lines > 0 && c.written === c.lines;
          return (
            <li key={c.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onSelect(c.key)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors md:border-transparent",
                  active ? "border-border bg-accent font-medium text-accent-foreground md:border-border" : "hover:bg-muted"
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate" title={c.name}>
                  {c.name}
                </span>
                <span className={cn("shrink-0 text-xs tabular-nums text-muted-foreground", done && "text-emerald-600 dark:text-emerald-400")}>
                  {showWritten ? (c.lines ? `${c.written}/${c.lines}` : "–") : c.lines}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
