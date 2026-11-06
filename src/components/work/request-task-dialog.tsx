"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestTaskAction } from "@/lib/actions/work";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** "Request a task" for the client side (decided W4). */
export function RequestTaskDialog({
  projects,
  defaultProjectId,
}: {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await requestTaskAction({
        projectId,
        title: String(formData.get("title") ?? ""),
        details: String(formData.get("details") ?? ""),
        dueDate: String(formData.get("dueDate") ?? ""),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Request sent. The team has been notified.");
      setOpen(false);
      router.push(`/work/projects/${result.data.projectId}?task=${result.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button data-tour="request-task">Request a task</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a task</DialogTitle>
          <DialogDescription>Tell the team what you need. You can follow its progress like any other task.</DialogDescription>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">There&apos;s no active project to add a request to yet.</p>
        ) : (
          <form action={submit} className="space-y-4">
            {projects.length > 1 && (
              <div className="space-y-1">
                <Label>Project</Label>
                <Select items={Object.fromEntries(projects.map((p) => [p.id, p.name]))} value={projectId} onValueChange={(v) => setProjectId(v ?? projectId)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="request-title">What do you need?</Label>
              <Input id="request-title" name="title" required placeholder="e.g. Update the staff handbook" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="request-details">Details</Label>
              <Textarea id="request-details" name="details" rows={4} placeholder="Anything that helps the team get it right" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="request-due">Needed by (optional)</Label>
              <Input id="request-due" name="dueDate" type="date" />
            </div>
            <Button type="submit" className="w-full" loading={isPending}>
              Send request
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
