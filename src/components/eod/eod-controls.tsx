"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { startDayAction } from "@/lib/actions/eod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StartDayButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await startDayAction();
          if (!result.ok) toast.error(result.error);
          else router.refresh();
        })
      }
    >
      <Play className="size-4" /> Start day
    </Button>
  );
}

/** A date box that opens that day's page (`basePath?date=`). */
export function DateJump({ value, max, basePath = "/eod" }: { value: string; max: string; basePath?: string }) {
  const router = useRouter();
  return (
    <Input
      type="date"
      aria-label="Go to a date"
      className="w-40"
      max={max}
      defaultValue={value}
      onChange={(e) => e.target.value && router.push(`${basePath}?date=${e.target.value}`)}
    />
  );
}
