"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { setVisitInstructionCheck } from "@/lib/actions/visits";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { cn } from "@/lib/utils";

/**
 * The visit-in-progress checklist: big tap targets (it's used on a phone,
 * often one-handed), optimistic so a tick lands instantly, and a progress
 * bar so "how much is left" reads at a glance.
 */
export function VisitChecklist({
  instructions,
  checkedIds,
  disabled = false,
}: {
  instructions: { id: string; label: string }[];
  checkedIds: string[];
  /** On a break — the list stays visible but can't be changed. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [checked, setOptimistic] = useOptimistic(
    new Set(checkedIds),
    (current: Set<string>, change: { id: string; checked: boolean }) => {
      const next = new Set(current);
      if (change.checked) next.add(change.id);
      else next.delete(change.id);
      return next;
    }
  );

  function toggle(id: string) {
    const next = !checked.has(id);
    startTransition(async () => {
      setOptimistic({ id, checked: next });
      try {
        const result = await setVisitInstructionCheck(id, next);
        if (!result.ok) toast.error(result.error);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save — check your connection"));
      }
      router.refresh();
    });
  }

  if (instructions.length === 0) {
    return <p className="text-sm text-muted-foreground">No care tasks set for this person yet.</p>;
  }

  const done = instructions.filter((i) => checked.has(i.id)).length;
  const percent = Math.round((done / instructions.length) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium tracking-wide uppercase">Care tasks</span>
        <span className={cn(done === instructions.length && "font-medium text-green-700 dark:text-green-400")}>
          {done} of {instructions.length} done
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Care tasks done"
      >
        <div className="h-full rounded-full bg-green-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <ul className="space-y-1.5">
        {instructions.map((i) => {
          const isChecked = checked.has(i.id);
          return (
            <li key={i.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isChecked}
                disabled={disabled}
                onClick={() => toggle(i.id)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-base transition-colors sm:text-sm",
                  isChecked ? "border-green-600/30 bg-green-500/10" : "hover:bg-muted/60",
                  disabled && "cursor-not-allowed opacity-60"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                    isChecked ? "border-green-600 bg-green-600 text-white" : "border-muted-foreground/40"
                  )}
                >
                  {isChecked && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className={cn("flex-1", isChecked && "text-muted-foreground line-through")}>{i.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
