"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/components/files/format-bytes";
import type { UploadStatus } from "@/components/files/use-upload";

export function UploadProgress({
  status,
  onCancel,
  className,
}: {
  status: UploadStatus | null;
  onCancel?: () => void;
  className?: string;
}) {
  if (!status) return null;
  const pct = status.total > 0 ? Math.min(100, Math.round((status.loaded / status.total) * 100)) : 0;

  return (
    <div role="status" aria-live="polite" className={cn("space-y-1.5 rounded-lg border p-2.5", className)}>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium">{status.label}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {status.processing
            ? "Scanning and saving…"
            : `${formatBytes(status.loaded)} of ${formatBytes(status.total)} · ${pct}%`}
        </span>
        {onCancel && !status.processing && (
          <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={`Uploading ${status.label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={status.processing ? 100 : pct}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full bg-primary transition-[width] duration-200", status.processing && "animate-pulse")}
          style={{ width: `${status.processing ? 100 : pct}%` }}
        />
      </div>
    </div>
  );
}
