"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { createProjectAction, updateProjectAction } from "@/lib/actions/work";
import { PROJECT_COLORS, WORK_PROJECT_STATUSES, WORK_PROJECT_STATUS_LABELS, projectColorClass, type WorkProjectStatus } from "@/lib/work";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NO_LEAD = "__none__";

type Existing = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: WorkProjectStatus;
  clientVisible: boolean;
  leadId: string | null;
  dueDate: string | null;
};

/** New project, or editing one when `project` is given. Managers only. */
export function ProjectFormDialog({
  people,
  project,
}: {
  people: { id: string; name: string }[];
  project?: Existing;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [color, setColor] = useState(project?.color ?? "blue");
  const [status, setStatus] = useState<WorkProjectStatus>(project?.status ?? "ACTIVE");
  const [leadId, setLeadId] = useState(project?.leadId ?? NO_LEAD);
  const [clientVisible, setClientVisible] = useState(project?.clientVisible ?? true);

  function submit(formData: FormData) {
    const input = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      dueDate: String(formData.get("dueDate") ?? ""),
      color,
      status,
      clientVisible,
      leadId: leadId === NO_LEAD ? null : leadId,
    };
    startTransition(async () => {
      const result = project ? await updateProjectAction(project.id, input) : await createProjectAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(project ? "Project saved" : "Project created");
      setOpen(false);
      if (!project && result.data) router.push(`/work/projects/${result.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          project ? (
            <Button variant="outline">
              <Pencil className="size-4" /> Edit project
            </Button>
          ) : (
            <Button data-tour="new-project">
              <Plus className="size-4" /> New project
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" name="name" required defaultValue={project?.name} placeholder="e.g. Website relaunch" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="project-description">Description</Label>
            <Textarea id="project-description" name="description" rows={3} defaultValue={project?.description ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Lead</Label>
              <Select
                items={{ [NO_LEAD]: "No lead", ...Object.fromEntries(people.map((p) => [p.id, p.name])) }}
                value={leadId}
                onValueChange={(v) => setLeadId(v ?? NO_LEAD)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_LEAD}>No lead</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="project-due">Due date</Label>
              <Input id="project-due" name="dueDate" type="date" defaultValue={project?.dueDate ?? ""} />
            </div>
          </div>
          {project && (
            <div className="space-y-1">
              <Label>Status</Label>
              <Select items={WORK_PROJECT_STATUS_LABELS} value={status} onValueChange={(v) => setStatus((v as WorkProjectStatus) ?? status)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORK_PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {WORK_PROJECT_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex gap-2">
              {Object.keys(PROJECT_COLORS).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-background", projectColorClass(c), color === c && "ring-2 ring-ring")}
                />
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(Boolean(v))} className="mt-0.5" />
            <span>
              Client can see this project
              <span className="block text-xs text-muted-foreground">Off for internal projects. Each task can also be hidden on its own.</span>
            </span>
          </label>
          <Button type="submit" className="w-full" loading={isPending}>
            {project ? "Save" : "Create project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
