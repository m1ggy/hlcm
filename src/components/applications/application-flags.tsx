import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ApplicationFlags({
  readyToSubmit,
  staleDays,
}: {
  readyToSubmit: boolean;
  staleDays: number | null;
}) {
  if (!readyToSubmit && staleDays === null) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {readyToSubmit && (
        <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 /> Ready to submit
        </Badge>
      )}
      {staleDays !== null && (
        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
          <AlertTriangle /> Stuck {staleDays}d
        </Badge>
      )}
    </div>
  );
}
