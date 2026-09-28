"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { toast } from "sonner";
import { dismissSetupChecklistAction } from "@/lib/actions/setup-checklist";
import type { SetupStep } from "@/lib/setup-checklist";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const [isPending, start] = useTransition();
  const doneCount = steps.filter((s) => s.done).length;

  function dismiss() {
    start(async () => {
      try {
        await dismissSetupChecklistAction();
      } catch {
        toast.error("Couldn't hide the checklist. Please try again.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Set up your workspace</CardTitle>
          <p className="text-sm text-muted-foreground">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <Button variant="ghost" size="sm" loading={isPending} onClick={dismiss}>
          {doneCount === steps.length ? "Done" : "Hide"}
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {steps.map((step) => (
          <Link key={step.id} href={step.href} className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            {step.done ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" aria-label="Done" />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="To do" />
            )}
            <div className="min-w-0 flex-1">
              <p className={step.done ? "font-medium text-muted-foreground line-through" : "font-medium"}>{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
