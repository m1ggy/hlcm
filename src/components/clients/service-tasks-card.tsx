"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { archiveTask, updateTask } from "@/lib/actions/tasks";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  type TaskPriorityValue,
  type TaskStatusValue,
} from "@/lib/task-status";
import { formatShortCalendarDate } from "@/lib/invoice-format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { TaskPriorityBadge } from "@/components/tasks/task-priority-badge";
import { NewStandaloneTaskDialog } from "@/components/tasks/new-standalone-task-dialog";

export type ServiceTask = {
  id: string;
  label: string;
  description: string | null;
  status: TaskStatusValue;
  priority: TaskPriorityValue | null;
  dueDate: Date | null;
  assignedUsers: { id: string; name: string }[];
  clientService?: { id: string; name: string } | null;
};

// updateTask/archiveTask only revalidate the task pages they know about —
// refresh whichever client/service page this table is on ourselves.
function useTaskUpdate(taskId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function save(fields: Record<string, string>, onError?: () => void) {
    const formData = new FormData();
    for (const [k, v] of Object.entries(fields)) formData.set(k, v);
    startTransition(async () => {
      try {
        await updateTask(taskId, formData);
        router.refresh();
      } catch (error) {
        onError?.();
        toast.error(error instanceof Error ? error.message : "Failed to update task");
      }
    });
  }
  return { isPending, save };
}

function TaskRow({
  task,
  clientId,
  showService,
  isAdmin,
}: {
  task: ServiceTask;
  clientId: string;
  showService: boolean;
  isAdmin: boolean;
}) {
  const [status, setStatus] = useState(task.status);
  const router = useRouter();
  const { isPending, save } = useTaskUpdate(task.id);
  const [isArchiving, startArchive] = useTransition();

  function changeStatus(next: TaskStatusValue) {
    const previous = status;
    setStatus(next);
    save({ status: next }, () => setStatus(previous));
  }

  return (
    <TableRow className={status === "COMPLETED" ? "text-muted-foreground" : undefined}>
      <TableCell className="w-8">
        <Checkbox
          checked={status === "COMPLETED"}
          onCheckedChange={(checked) => changeStatus(checked ? "COMPLETED" : "NOT_STARTED")}
          aria-label={`Mark "${task.label}" ${status === "COMPLETED" ? "not done" : "done"}`}
        />
      </TableCell>
      <TableCell className={`font-medium ${status === "COMPLETED" ? "line-through" : ""}`}>{task.label}</TableCell>
      {showService && (
        <TableCell>
          {task.clientService ? (
            <Link href={`/clients/${clientId}/services/${task.clientService.id}?tab=tasks`} className="text-primary hover:underline">
              {task.clientService.name}
            </Link>
          ) : (
            "—"
          )}
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap tabular-nums">{task.dueDate ? formatShortCalendarDate(task.dueDate) : "—"}</TableCell>
      <TableCell>{task.assignedUsers.map((u) => u.name).join(", ") || "—"}</TableCell>
      <TableCell>
        <TaskStatusSelect value={status} onValueChange={changeStatus} loading={isPending} />
      </TableCell>
      <TableCell>
        <TaskPriorityBadge priority={task.priority} />
      </TableCell>
      <TableCell className="max-w-[16rem] truncate text-muted-foreground" title={task.description ?? undefined}>
        {task.description || "—"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${task.label}`} disabled={isArchiving}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {TASK_PRIORITIES.map((p) => (
                  <DropdownMenuItem key={p} onClick={() => save({ priority: p })}>
                    {TASK_PRIORITY_LABELS[p]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onClick={() => save({ priority: "" })}>None</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    if (!confirm(`Archive "${task.label}"?`)) return;
                    startArchive(async () => {
                      try {
                        await archiveTask(task.id);
                        toast.success("Task archived");
                        router.refresh();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to archive task");
                      }
                    });
                  }}
                >
                  Archive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

/**
 * Tasks table from the Service X – Tasks mockup. On a service page tasks are
 * added straight under it (`clientServiceId`); on the client page the table
 * spans every service, with a Service column and filter (`services`).
 */
export function ServiceTasksCard({
  clientId,
  clientServiceId,
  services,
  tasks,
  assignableUsers,
  currentUserId,
  isAdmin,
}: {
  clientId: string;
  clientServiceId?: string;
  services?: { id: string; name: string }[];
  tasks: ServiceTask[];
  assignableUsers: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const showService = !clientServiceId;
  const [serviceFilter, setServiceFilter] = useState("");
  const visible = serviceFilter ? tasks.filter((t) => t.clientService?.id === serviceFilter) : tasks;
  const canAdd = !!clientServiceId || (services?.length ?? 0) > 0;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">Tasks ({visible.length})</h2>
          <div className="flex items-center gap-2">
            {showService && services && services.length > 1 && (
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                aria-label="Filter by service"
              >
                <option value="">All services</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {canAdd && (
              <NewStandaloneTaskDialog
                assignableUsers={assignableUsers}
                currentUserId={currentUserId}
                clientServiceId={clientServiceId}
                services={clientServiceId ? undefined : services}
                triggerLabel="+ Add Task"
              />
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Task Name</TableHead>
                {showService && <TableHead>Service</TableHead>}
                <TableHead>Due Date</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-10">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={showService ? 9 : 8} className="text-center text-muted-foreground">
                    {canAdd ? "No tasks yet." : "Add a service first — tasks are filed under one."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((task) => (
                <TaskRow key={task.id} task={task} clientId={clientId} showService={showService} isAdmin={isAdmin} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
