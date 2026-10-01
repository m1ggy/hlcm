"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createStandaloneTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import { Option } from "./task-types";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/task-status";

const NONE = "__none__";
const RECURRENCE_OPTIONS = ["daily", "weekly", "biweekly", "monthly"] as const;

export function NewStandaloneTaskDialog({
  assignableUsers,
  currentUserId,
  clientServiceId,
  services,
  triggerLabel = "New Task",
}: {
  assignableUsers: Option[];
  currentUserId: string;
  /** Files the new task under this ClientService (the service page). */
  clientServiceId?: string;
  /** Lets the person pick which service it's for (the client page's Tasks tab). */
  services?: Option[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [assignedUserIds, setAssignedUserIds] = useState([currentUserId]);
  const [recurrenceRule, setRecurrenceRule] = useState(NONE);
  const [priority, setPriority] = useState(NONE);
  const [serviceId, setServiceId] = useState(services?.[0]?.id ?? NONE);

  function handleSubmit(formData: FormData) {
    for (const id of assignedUserIds) formData.append("assignedUserId", id);
    if (recurrenceRule !== NONE) formData.set("recurrenceRule", recurrenceRule);
    if (priority !== NONE) formData.set("priority", priority);
    const linkedServiceId = clientServiceId ?? (serviceId !== NONE ? serviceId : undefined);
    if (linkedServiceId) formData.set("clientServiceId", linkedServiceId);
    startTransition(async () => {
      try {
        await createStandaloneTask(formData);
        toast.success("Task created");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create task");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>{triggerLabel}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" required placeholder="e.g. Weekly client report update" />
          </div>
          {services && services.length > 0 && (
            <div className="space-y-1">
              <Label>Service</Label>
              <Select
                items={Object.fromEntries(services.map((s) => [s.id, s.name]))}
                value={serviceId}
                onValueChange={(v) => setServiceId(v ?? serviceId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" />
          </div>
          <div className="space-y-1">
            <Label>Assigned to</Label>
            <MultiUserSelect
              items={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
              value={assignedUserIds}
              onValueChange={setAssignedUserIds}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select
                items={{ [NONE]: "None", ...TASK_PRIORITY_LABELS }}
                value={priority}
                onValueChange={(v) => setPriority(v ?? NONE)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            <div className="space-y-1">
              <Label>Repeats</Label>
              <Select
                items={{ [NONE]: "Doesn't repeat", ...Object.fromEntries(RECURRENCE_OPTIONS.map((r) => [r, r])) }}
                value={recurrenceRule}
                onValueChange={(v) => setRecurrenceRule(v ?? NONE)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Doesn&apos;t repeat</SelectItem>
                  {RECURRENCE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={assignedUserIds.length === 0} loading={isPending}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
