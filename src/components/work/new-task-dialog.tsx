"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createTaskAction } from "@/lib/actions/work";
import { WORK_TASK_PRIORITIES, WORK_TASK_PRIORITY_LABELS, type WorkTaskPriority } from "@/lib/work";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiUserSelect } from "@/components/ui/multi-user-select";

export type CreatedTask = { id: string; title: string; assigneeIds: string[] };

/**
 * The full "New task" form: everything a task needs up front (who, when,
 * whether the client sees it), so people don't have to create a bare title
 * and then hunt for the panel to finish it.
 */
export function NewTaskDialog({
  open,
  onOpenChange,
  projectId,
  projectClientVisible,
  people,
  currentUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectClientVisible: boolean;
  people: { id: string; name: string }[];
  currentUserId: string;
  onCreated: (task: CreatedTask, openIt: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const blank = () => ({
    title: "",
    description: "",
    dueDate: "",
    priority: "NORMAL" as WorkTaskPriority,
    assigneeIds: people.some((p) => p.id === currentUserId) ? [currentUserId] : [],
    clientVisible: projectClientVisible,
  });
  const [form, setForm] = useState(blank);
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: ReturnType<typeof blank>[K]) => setForm((f) => ({ ...f, [key]: value }));
  const peopleItems = Object.fromEntries(people.map((p) => [p.id, p.name]));

  function changeOpen(next: boolean) {
    if (next) setForm(blank());
    onOpenChange(next);
  }

  function submit(another: boolean) {
    const title = form.title.trim();
    if (!title) {
      toast.error("Give the task a title");
      titleRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const r = await createTaskAction({
        projectId,
        title,
        description: form.description,
        dueDate: form.dueDate,
        priority: form.priority,
        assigneeIds: form.assigneeIds,
        clientVisible: projectClientVisible && form.clientVisible,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
      onCreated({ id: r.data.id, title, assigneeIds: form.assigneeIds }, false);
      if (another) {
        toast.success(`Added "${title}"`);
        // Keep who/when/visibility: the next task is usually for the same people.
        setForm((f) => ({ ...f, title: "", description: "" }));
        titleRef.current?.focus();
      } else {
        toast.success(`Added "${title}"`, { action: { label: "Open", onClick: () => onCreated({ id: r.data.id, title, assigneeIds: form.assigneeIds }, true) } });
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Only the title is required. You can change everything later from the task.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="new-task-title">Title</Label>
            <Input
              id="new-task-title"
              ref={titleRef}
              autoFocus
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Send the signed lease to the landlord"
              maxLength={500}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-task-details">Details (optional)</Label>
            <Textarea id="new-task-details" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Anything whoever picks it up needs to know" />
          </div>
          <div className="space-y-1">
            <Label>Assigned to</Label>
            <MultiUserSelect items={peopleItems} value={form.assigneeIds} onValueChange={(v) => set("assigneeIds", v)} placeholder="Add people..." />
            {form.assigneeIds.length === 0 && <p className="text-xs text-muted-foreground">Nobody yet. It shows as Unassigned until someone is added.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-task-due">Due date (optional)</Label>
              <Input id="new-task-due" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select items={WORK_TASK_PRIORITY_LABELS} value={form.priority} onValueChange={(v) => v && set("priority", v as WorkTaskPriority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {WORK_TASK_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {projectClientVisible ? (
            <label className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
              <Checkbox className="mt-0.5" checked={form.clientVisible} onCheckedChange={(v) => set("clientVisible", Boolean(v))} />
              <span>
                Client can see this task
                <span className="block text-xs text-muted-foreground">Untick for internal work (prep, admin, our own follow-ups).</span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">This project is hidden from the client, so this task will be too.</p>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => submit(true)}>
              <Plus className="size-4" /> Create and add another
            </Button>
            <Button type="submit" loading={isPending}>
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
