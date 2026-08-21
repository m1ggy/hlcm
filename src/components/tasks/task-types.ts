import { TaskStatusValue } from "@/lib/task-status";

export type TaskUserRef = { id: string; name: string };

export type TaskItem = {
  id: string;
  label: string;
  description: string | null;
  status: TaskStatusValue;
  dueDate: Date | null;
  blockedReason: string | null;
  phaseId: string | null;
  createdById: string;
  assignedUsers: TaskUserRef[];
  reviewers: TaskUserRef[];
  subtasks: TaskItem[];
};

export type Option = { id: string; name: string };
