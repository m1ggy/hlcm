"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock } from "lucide-react";
import { updateTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";

export function OverdueTaskActions({ taskId, dueDate }: { taskId: string; dueDate: Date }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(formData: FormData) {
    startTransition(async () => {
      try {
        await updateTask(taskId, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update task");
      }
    });
  }

  function snooze() {
    const next = new Date(dueDate);
    next.setDate(next.getDate() + 7);
    const formData = new FormData();
    formData.set("dueDate", next.toISOString().slice(0, 10));
    run(formData);
  }

  function complete() {
    const formData = new FormData();
    formData.set("status", "COMPLETED");
    run(formData);
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" disabled={isPending} onClick={snooze} title="Snooze 1 week">
        <Clock />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={isPending} onClick={complete} title="Mark complete">
        <Check />
      </Button>
    </div>
  );
}
