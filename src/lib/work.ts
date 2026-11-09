// Projects and tasks (docs/workspace-tasks-plan.md, Phase 2): the rules that
// don't need a database. Pure, so client components and tests can use them.
//
// Two sides share a workspace's projects:
// - the team: the people doing the work. In a client company's tasks-only
//   workspace that's the managing company's assigned staff (their linked
//   accounts); in a full workspace, everyone but CLIENT users.
// - the client: the client company's own people (in a tasks-only workspace,
//   every non-linked account, its OWNER included) or CLIENT users. They see
//   only client-visible projects and tasks, client comments and
//   client-visible activity, and they can comment and request tasks.

export const WORK_TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"] as const;
export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number];

export const WORK_TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

/** Statuses that still need work. */
export const OPEN_WORK_STATUSES: WorkTaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED"];

export function isOpenStatus(status: WorkTaskStatus) {
  return OPEN_WORK_STATUSES.includes(status);
}

export const WORK_REPEATS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type WorkRepeat = (typeof WORK_REPEATS)[number];
export const WORK_REPEAT_LABELS: Record<WorkRepeat, string> = { DAILY: "Every day", WEEKLY: "Every week", MONTHLY: "Every month" };

/** The next due date (YYYY-MM-DD) of a recurring task due on `day`. A monthly task due the 31st lands on the month's last day. */
export function nextRepeatDate(day: string, repeat: WorkRepeat) {
  const d = new Date(`${day}T00:00:00Z`);
  if (repeat === "DAILY") d.setUTCDate(d.getUTCDate() + 1);
  else if (repeat === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const target = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(target, lastDay));
  }
  return d.toISOString().slice(0, 10);
}

export const WORK_TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type WorkTaskPriority = (typeof WORK_TASK_PRIORITIES)[number];

export const WORK_TASK_PRIORITY_LABELS: Record<WorkTaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const WORK_PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "DONE", "ARCHIVED"] as const;
export type WorkProjectStatus = (typeof WORK_PROJECT_STATUSES)[number];

export const WORK_PROJECT_STATUS_LABELS: Record<WorkProjectStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  DONE: "Done",
  ARCHIVED: "Archived",
};

/** Project color keys (stored on WorkProject.color) and their swatch classes. */
export const PROJECT_COLORS = {
  blue: "bg-blue-600",
  teal: "bg-teal-600",
  marigold: "bg-amber-500",
  violet: "bg-violet-600",
  rose: "bg-rose-600",
  slate: "bg-slate-500",
} as const;
export type ProjectColor = keyof typeof PROJECT_COLORS;

export function projectColorClass(color: string) {
  return PROJECT_COLORS[color as ProjectColor] ?? PROJECT_COLORS.blue;
}

/** Who's looking: enough to decide what they may see and do. */
export type WorkViewer = {
  userId: string;
  role: string;
  /** A linked account (a managing company's person in this workspace). */
  isAssigned: boolean;
  orgKind: "FULL" | "TASKS";
};

export type WorkScope = {
  side: "team" | "client" | "none";
  /** Create, edit and archive projects; decline client requests. */
  canManageProjects: boolean;
  /** Create, edit, assign and complete tasks. */
  canEditTasks: boolean;
  /** Internal comments, hidden tasks/projects, hours. */
  canSeeInternal: boolean;
  /** "Request a task". */
  canRequestTasks: boolean;
  canComment: boolean;
};

const MANAGERS = ["DEVELOPER", "OWNER", "ADMIN", "MANAGER"];
const NONE: WorkScope = { side: "none", canManageProjects: false, canEditTasks: false, canSeeInternal: false, canRequestTasks: false, canComment: false };
const CLIENT: WorkScope = { side: "client", canManageProjects: false, canEditTasks: false, canSeeInternal: false, canRequestTasks: true, canComment: true };

export function workScope(viewer: WorkViewer): WorkScope {
  if (viewer.role === "CAREGIVER") return NONE;
  const isTeam =
    viewer.orgKind === "TASKS"
      ? // The managing company's people, and a platform admin's support account.
        viewer.isAssigned || viewer.role === "DEVELOPER"
      : viewer.role !== "CLIENT";
  if (!isTeam) return CLIENT;
  return {
    side: "team",
    canManageProjects: MANAGERS.includes(viewer.role),
    canEditTasks: true,
    canSeeInternal: true,
    canRequestTasks: false,
    canComment: true,
  };
}

/** Prisma filter for the projects this scope may see. */
export function projectWhere(scope: WorkScope) {
  if (scope.side === "none") return { id: "__none__" };
  if (scope.side === "client") return { clientVisible: true, status: { not: "ARCHIVED" as const } };
  return {};
}

/** Prisma filter for the tasks this scope may see (always within visible projects). */
export function taskWhere(scope: WorkScope) {
  if (scope.side === "none") return { id: "__none__" };
  if (scope.side === "client") return { clientVisible: true, project: projectWhere(scope) };
  return {};
}

export function commentWhere(scope: WorkScope) {
  return scope.canSeeInternal ? {} : { visibility: "CLIENT" as const };
}

export function activityWhere(scope: WorkScope) {
  return scope.canSeeInternal ? {} : { clientVisible: true };
}

/** "Overdue": open, with a due date before today (dates are calendar days). */
export function isOverdue(task: { status: WorkTaskStatus; dueDate: Date | string | null }, today: string) {
  if (!task.dueDate || !isOpenStatus(task.status)) return false;
  const due = typeof task.dueDate === "string" ? task.dueDate.slice(0, 10) : task.dueDate.toISOString().slice(0, 10);
  return due < today;
}

/** Label for an activity row, shared by the task panel and the project's activity tab. */
export function describeActivity(a: { kind: string; from: string | null; to: string | null }) {
  const status = (s: string | null) => (s && s in WORK_TASK_STATUS_LABELS ? WORK_TASK_STATUS_LABELS[s as WorkTaskStatus] : s);
  switch (a.kind) {
    case "CREATED":
      return "created the task";
    case "REQUESTED":
      return "requested this task";
    case "STATUS_CHANGED":
      return `moved it from ${status(a.from)} to ${status(a.to)}`;
    case "ASSIGNED":
      return `assigned ${a.to ?? "someone"}`;
    case "UNASSIGNED":
      return `unassigned ${a.from ?? "someone"}`;
    case "COMMENTED":
      return "commented";
    case "FILE_ADDED":
      return `added ${a.to ?? "a file"}`;
    case "DUE_CHANGED":
      return a.to ? `set the due date to ${a.to}` : "removed the due date";
    case "DECLINED":
      return `declined the request: ${a.to ?? ""}`;
    case "APPROVED":
      return "accepted the request";
    case "REPORTED":
      return `reported: ${a.to ?? ""}`;
    default:
      return "updated the task";
  }
}
