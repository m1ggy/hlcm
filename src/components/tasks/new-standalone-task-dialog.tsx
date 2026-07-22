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
import { Option } from "./task-types";

const NONE = "__none__";
const RECURRENCE_OPTIONS = ["daily", "weekly", "biweekly", "monthly"] as const;

export function NewStandaloneTaskDialog({
  assignableUsers,
  currentUserId,
}: {
  assignableUsers: Option[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [assignedUserId, setAssignedUserId] = useState(currentUserId);
  const [recurrenceRule, setRecurrenceRule] = useState(NONE);

  function handleSubmit(formData: FormData) {
    formData.set("assignedUserId", assignedUserId);
    if (recurrenceRule !== NONE) formData.set("recurrenceRule", recurrenceRule);
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
      <DialogTrigger render={<Button>New Task</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="label">Label</Label>
            <Input id="label" name="label" required placeholder="e.g. Weekly client report update" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" />
          </div>
          <div className="space-y-1">
            <Label>Assigned to</Label>
            <Select
              items={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
              value={assignedUserId}
              onValueChange={(v) => setAssignedUserId(v ?? assignedUserId)}
            >
              <SelectTrigger className="w-full">
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
          <div className="grid grid-cols-2 gap-4">
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
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating..." : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
