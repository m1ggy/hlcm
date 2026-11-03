import { AlertTriangle, CheckCircle2, Clock, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAYMENT_STATUS_LABELS, paymentStatus } from "@/lib/payroll";

type PaymentLike = {
  acknowledgedAt: Date | null;
  problemReportedAt: Date | null;
  problemResolvedAt: Date | null;
} | null;

const STYLES = {
  unpaid: { className: "bg-muted text-muted-foreground", Icon: CircleDashed },
  awaiting: { className: "bg-sky-500/15 text-sky-800 dark:text-sky-300", Icon: Clock },
  resolved: { className: "bg-sky-500/15 text-sky-800 dark:text-sky-300", Icon: Clock },
  received: { className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300", Icon: CheckCircle2 },
  problem: { className: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
} as const;

/** One person's payroll status as a small pill — "Not paid" when `payment` is null. */
export function PayrollStatusBadge({ payment, short = false }: { payment: PaymentLike; short?: boolean }) {
  const status = payment ? paymentStatus(payment) : "unpaid";
  const { className, Icon } = STYLES[status];
  const label = short && (status === "awaiting" || status === "resolved") ? "Awaiting confirmation" : PAYMENT_STATUS_LABELS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      <Icon className="size-3" /> {label}
    </span>
  );
}
