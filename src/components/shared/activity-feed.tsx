import Link from "next/link";
import { CheckCircle2, CreditCard, FileText, FileUp, Layers, RefreshCw, Scale, type LucideIcon } from "lucide-react";
import { describeAuditEntry, type AuditEntry, type Lookups } from "@/components/applications/audit-log-panel";
import { cn } from "@/lib/utils";

type Kind = { title: string; icon: LucideIcon; tone: string };

const TONE = {
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  purple: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  muted: "bg-muted text-muted-foreground",
};

// The headline + icon for the kinds of event the PDF's "Recent Activity"
// calls out (payment received, invoice created, task completed, document
// uploaded, …); anything else just reads as its plain description.
function kindOf(entry: AuditEntry): Kind | null {
  switch (entry.action) {
    case "record_manual_payment":
    case "mark_paid":
      return { title: "Payment received", icon: CreditCard, tone: TONE.green };
    case "create":
    case "create_manual":
    case "import_stripe":
      return entry.context?.label.startsWith("Invoice")
        ? { title: "Invoice created", icon: FileText, tone: TONE.blue }
        : null;
    case "create_standalone":
    case "create_subtask":
      return { title: "Task added", icon: CheckCircle2, tone: TONE.blue };
    case "upload_file":
      return { title: "Document uploaded", icon: FileUp, tone: TONE.purple };
    case "add_client_service":
      return { title: "Service added", icon: Layers, tone: TONE.blue };
    case "change_service_status":
    case "auto_status":
      return { title: "Status changed", icon: RefreshCw, tone: TONE.amber };
    case "add_adjustment":
    case "remove_adjustment":
      return { title: "Adjustment", icon: Scale, tone: TONE.amber };
  }
  if (entry.field === "status" && entry.newValue === "COMPLETED" && entry.context && !entry.context.label.startsWith("Invoice")) {
    return { title: "Task completed", icon: CheckCircle2, tone: TONE.green };
  }
  return null;
}

function when(date: Date) {
  const d = new Date(date);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return `Today, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Compact activity list (date, user, action) for the Overview tabs. */
export function ActivityFeed({ entries, lookups = {} }: { entries: AuditEntry[]; lookups?: Lookups }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ul className="divide-y">
      {entries.map((entry) => {
        const kind = kindOf(entry);
        const Icon = kind?.icon ?? FileText;
        const description = describeAuditEntry(entry, lookups);
        return (
          <li key={entry.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", kind?.tone ?? TONE.muted)}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p>
                {kind && <span className="font-medium">{kind.title} – </span>}
                <span className={kind ? "text-muted-foreground" : undefined}>{description}</span>
              </p>
              {entry.context &&
                (entry.context.href ? (
                  <Link href={entry.context.href} className="text-xs text-primary hover:underline">
                    {entry.context.label}
                  </Link>
                ) : (
                  <p className="text-xs text-muted-foreground">{entry.context.label}</p>
                ))}
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <p title={new Date(entry.createdAt).toLocaleString()}>{when(entry.createdAt)}</p>
              <p>by {entry.actor.name}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
