"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Expand, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CommentThread } from "@/components/comment-thread";
import { updateTask, setTaskReviewer, deleteTask } from "@/lib/actions/tasks";
import { listTaskNotes, addTaskNote } from "@/lib/actions/notes";
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatusValue } from "@/lib/task-status";
import { Option } from "./task-types";

const NONE = "__none__";

type Note = { id: string; body: string; createdAt: Date; author: { id: string; name: string } };

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function TaskDetailDialog({
  taskId,
  label,
  description,
  status,
  dueDate,
  blockedReason,
  assignedUserId,
  reviewerId,
  hasReviewer,
  assignableUsers,
  canDelete,
}: {
  taskId: string;
  label: string;
  description: string | null;
  status: TaskStatusValue;
  dueDate: Date | null;
  blockedReason: string | null;
  assignedUserId: string;
  reviewerId: string | null;
  hasReviewer: boolean;
  assignableUsers: Option[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const [localLabel, setLocalLabel] = useState(label);
  const [localDescription, setLocalDescription] = useState(description ?? "");
  const [localStatus, setLocalStatus] = useState(status);
  const [localAssignedUserId, setLocalAssignedUserId] = useState(assignedUserId);
  const [localDueDate, setLocalDueDate] = useState(toDateInputValue(dueDate));
  const [localBlockedReason, setLocalBlockedReason] = useState(blockedReason ?? "");
  const [localReviewerId, setLocalReviewerId] = useState(reviewerId ?? NONE);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);

  useEffect(() => {
    if (!open || notesLoaded) return;
    listTaskNotes(taskId).then((data) => {
      setNotes(data);
      setNotesLoaded(true);
    });
  }, [open, notesLoaded, taskId]);

  function save(overrides: Partial<{ label: string; description: string; status: string; assignedUserId: string; dueDate: string; blockedReason: string }>) {
    const formData = new FormData();
    formData.set("label", overrides.label ?? localLabel);
    formData.set("description", overrides.description ?? localDescription);
    formData.set("status", overrides.status ?? localStatus);
    formData.set("assignedUserId", overrides.assignedUserId ?? localAssignedUserId);
    formData.set("dueDate", overrides.dueDate ?? localDueDate);
    formData.set("blockedReason", overrides.blockedReason ?? localBlockedReason);
    startTransition(async () => {
      try {
        await updateTask(taskId, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update task");
      }
    });
  }

  function handleReviewerChange(value: string | null) {
    const next = value ?? NONE;
    setLocalReviewerId(next);
    startTransition(async () => {
      try {
        await setTaskReviewer(taskId, next === NONE ? null : next);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update reviewer");
      }
    });
  }

  async function handleCommentSubmit(body: string, mentionedUserIds: string[]) {
    const note = await addTaskNote({ taskId, body, mentionedUserIds });
    setNotes((prev) => [...prev, note]);
  }

  function handleDelete() {
    if (!confirm("Delete this task? This can't be undone.")) return;
    startTransition(async () => {
      try {
        await deleteTask(taskId);
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete task");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" title="Expand task">
            <Expand className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Input
              value={localLabel}
              onChange={(e) => setLocalLabel(e.target.value)}
              onBlur={() => localLabel.trim() && save({ label: localLabel })}
              className="h-9 flex-1 border-transparent px-0 text-lg font-semibold hover:border-input focus-visible:border-ring"
            />
            {canDelete && (
              <Button variant="ghost" size="icon-sm" onClick={handleDelete} title="Delete task">
                <Trash2 className="size-4" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              onBlur={() => save({ description: localDescription })}
              rows={3}
              placeholder="Add more detail..."
              className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select
                items={Object.fromEntries(TASK_STATUSES.map((s) => [s, TASK_STATUS_LABELS[s]]))}
                value={localStatus}
                onValueChange={(v) => {
                  const next = (v ?? localStatus) as TaskStatusValue;
                  setLocalStatus(next);
                  save({ status: next });
                }}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Assigned</label>
              <Select
                items={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
                value={localAssignedUserId}
                onValueChange={(v) => {
                  const next = v ?? localAssignedUserId;
                  setLocalAssignedUserId(next);
                  save({ assignedUserId: next });
                }}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Due date</label>
              <Input
                type="date"
                value={localDueDate}
                onChange={(e) => {
                  setLocalDueDate(e.target.value);
                  save({ dueDate: e.target.value });
                }}
                className="h-8"
              />
            </div>

            {hasReviewer && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Reviewer</label>
                <Select
                  items={{ [NONE]: "None", ...Object.fromEntries(assignableUsers.map((u) => [u.id, u.name])) }}
                  value={localReviewerId}
                  onValueChange={handleReviewerChange}
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {localStatus === "BLOCKED" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Blocked on</label>
              <Input
                value={localBlockedReason}
                onChange={(e) => setLocalBlockedReason(e.target.value)}
                onBlur={() => save({ blockedReason: localBlockedReason })}
                placeholder="What/who is this waiting on?"
              />
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-medium">Comments</h3>
            <CommentThread notes={notes} mentionableUsers={assignableUsers} onSubmit={handleCommentSubmit} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
