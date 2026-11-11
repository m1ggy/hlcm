import type { TaskStatusValue } from "@/lib/task-status";
import type { WorkTaskStatus } from "@/lib/work";

// What the EOD pages hand their client components (src/lib/eod.ts REPORT_INCLUDE, serialized).

export type EodLine = {
  id: string;
  taskId: string | null;
  title: string;
  clientId: string | null;
  statusBefore: TaskStatusValue | null;
  statusAfter: TaskStatusValue | null;
  workDone: string;
  internalNote: string | null;
  minutes: number | null;
  clientVisible: boolean;
  correspondence: CorrespondenceLink[];
  /** A task in a client workspace instead of one here (workspace tasks Phase 5). */
  work: { orgId: string; taskId: string; workspaceName: string } | null;
  workStatusBefore: WorkTaskStatus | null;
  workStatusAfter: WorkTaskStatus | null;
  /** Written as an update on the task (already posted there), and whether it came in after submitting. */
  fromTaskUpdate: boolean;
  addedAfterSubmit: boolean;
};

/** Correspondence a line points at ("sent the follow-up email"). */
export type CorrespondenceLink = { id: string; subject: string; kind: string; occurredAt: Date };
/** What a task line could point at: the task's and its application's recent correspondence. */
export type LinkableCorrespondence = CorrespondenceLink & { taskId: string };

export type EodComment = { id: string; body: string; createdAt: Date; author: { id: string; name: string } };

export type EodReportData = {
  id: string;
  reportDate: string;
  status: "DRAFT" | "SUBMITTED";
  startedAt: Date;
  submittedAt: Date | null;
  summary: string | null;
  blockers: string | null;
  tomorrowPlan: string | null;
  reopenedAt: Date | null;
  reopenedByName: string | null;
  author: { id: string; name: string };
  items: EodLine[];
  comments: EodComment[];
};

export type TaskOption = { id: string; label: string; applicationName: string | null };
/** One of my open tasks in a client workspace, for "Add a task". */
export type WorkTaskOption = { orgId: string; taskId: string; title: string; workspaceName: string; projectName: string; clientVisible: boolean };
