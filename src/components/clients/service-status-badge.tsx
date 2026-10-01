import { SERVICE_STATUS_CLASS, SERVICE_STATUS_DESCRIPTIONS, SERVICE_STATUS_LABELS, type ServiceStatus } from "@/lib/service-status";
import { cn } from "@/lib/utils";

export function ServiceStatusBadge({ status, className }: { status: ServiceStatus; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", SERVICE_STATUS_CLASS[status], className)}
      title={SERVICE_STATUS_DESCRIPTIONS[status]}
    >
      {SERVICE_STATUS_LABELS[status]}
    </span>
  );
}
