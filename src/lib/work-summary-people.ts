import type { DaySummary, SummaryPerson } from "@/lib/work-summary";

// The weekly summary by person (docs/summary-by-person-plan.md): a day's
// events regrouped under who did them, one row per task with that task's
// events in order. Pure, so the page can use it in the browser.

export type PersonEvent =
  | { kind: "finished"; at: Date }
  | { kind: "moved"; at: Date; from: string | null; to: string | null }
  | { kind: "declined"; at: Date }
  | { kind: "added"; at: Date; requested: boolean }
  | { kind: "comment"; at: Date; body: string }
  | { kind: "file"; at: Date; fileName: string }
  | { kind: "update"; at: Date; text: string };

export type PersonTask = { taskId: string; title: string; projectName: string; finished: boolean; events: PersonEvent[] };

export type PersonCounts = { completed: number; progressed: number; added: number; comments: number; files: number; updates: number };

export type PersonDay = SummaryPerson & {
  counts: PersonCounts;
  /** Their tracked hours this day, when the viewer may see them per person. */
  hours: number | null;
  tasks: PersonTask[];
};

const time = (d: Date) => new Date(d).getTime();

/** A day's activity grouped by person: the team (busiest first), then the client's own people. */
export function groupDayByPerson(d: DaySummary, people: SummaryPerson[]): { team: PersonDay[]; client: PersonDay[] } {
  const known = new Map(people.map((p) => [p.id, p]));
  const byPerson = new Map<string, PersonDay>();
  const personDay = (id: string, name: string) => {
    let p = byPerson.get(id);
    if (!p) {
      const who = known.get(id) ?? { id, name, side: "team" as const };
      p = { ...who, counts: { completed: 0, progressed: 0, added: 0, comments: 0, files: 0, updates: 0 }, hours: d.hoursBy ? (d.hoursBy[id] ?? 0) : null, tasks: [] };
      byPerson.set(id, p);
    }
    return p;
  };
  const push = (item: { byId: string; by: string; taskId: string; title: string; projectName: string }, count: keyof PersonCounts, e: PersonEvent) => {
    const p = personDay(item.byId, item.by);
    p.counts[count]++;
    let task = p.tasks.find((t) => t.taskId === item.taskId);
    if (!task) {
      task = { taskId: item.taskId, title: item.title, projectName: item.projectName, finished: false, events: [] };
      p.tasks.push(task);
    }
    if (e.kind === "finished") task.finished = true;
    task.events.push(e);
  };

  for (const c of d.completed) push(c, "completed", { kind: "finished", at: c.at });
  for (const m of d.progressed) push(m, "progressed", m.declined ? { kind: "declined", at: m.at } : { kind: "moved", at: m.at, from: m.from, to: m.to });
  for (const a of d.added) push(a, "added", { kind: "added", at: a.at, requested: a.requested });
  for (const c of d.comments) push(c, "comments", { kind: "comment", at: c.at, body: c.body });
  for (const f of d.files) push(f, "files", { kind: "file", at: f.at, fileName: f.fileName });
  for (const u of d.updates) push(u, "updates", { kind: "update", at: u.at, text: u.text });
  // Someone who only tracked time still shows, with their hours.
  if (d.hoursBy) for (const [id, h] of Object.entries(d.hoursBy)) if (h > 0) personDay(id, known.get(id)?.name ?? "Someone");

  const all = [...byPerson.values()];
  for (const p of all) {
    for (const t of p.tasks) t.events.sort((a, b) => time(a.at) - time(b.at));
    // The day in the order it happened.
    p.tasks.sort((a, b) => time(a.events[0].at) - time(b.events[0].at));
  }
  const total = (p: PersonDay) => Object.values(p.counts).reduce((s, n) => s + n, 0);
  const order = (a: PersonDay, b: PersonDay) => total(b) - total(a) || (b.hours ?? 0) - (a.hours ?? 0) || a.name.localeCompare(b.name);
  return { team: all.filter((p) => p.side === "team").sort(order), client: all.filter((p) => p.side === "client").sort(order) };
}

/** How many things a person did on a day (for the "Who worked" grid). */
export function personDayCount(d: DaySummary, personId: string) {
  const mine = <T extends { byId: string }>(items: T[]) => items.filter((i) => i.byId === personId).length;
  return mine(d.completed) + mine(d.progressed) + mine(d.added) + mine(d.comments) + mine(d.files) + mine(d.updates);
}

/** The day with only one person's activity (and hours, when known per person). */
export function filterDayToPerson(d: DaySummary, personId: string): DaySummary {
  const mine = <T extends { byId: string }>(items: T[]) => items.filter((i) => i.byId === personId);
  return {
    ...d,
    completed: mine(d.completed),
    progressed: mine(d.progressed),
    added: mine(d.added),
    comments: mine(d.comments),
    files: mine(d.files),
    updates: mine(d.updates),
    hours: d.hoursBy ? (d.hoursBy[personId] ?? 0) : d.hours,
    hoursBy: d.hoursBy ? { [personId]: d.hoursBy[personId] ?? 0 } : null,
  };
}
