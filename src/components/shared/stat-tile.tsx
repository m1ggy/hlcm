import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONES = {
  blue: { card: "bg-sky-50/70 dark:bg-sky-950/30", icon: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300", value: "" },
  green: {
    card: "bg-emerald-50/70 dark:bg-emerald-950/30",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    value: "",
  },
  purple: {
    card: "bg-violet-50/70 dark:bg-violet-950/30",
    icon: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
    value: "",
  },
  red: {
    card: "bg-rose-50/70 dark:bg-rose-950/30",
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
    value: "text-rose-700 dark:text-rose-400",
  },
  neutral: { card: "", icon: "bg-muted text-muted-foreground", value: "" },
} as const;

export type StatTone = keyof typeof TONES;

/** KPI tile from the client/service mockups: tinted card, round icon, big number. */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  size = "default",
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: StatTone;
  size?: "default" | "sm";
}) {
  const t = TONES[tone];
  return (
    <Card size="sm" className={cn("ring-foreground/5", t.card)}>
      <CardContent className="flex items-center gap-3">
        {Icon && (
          <span className={cn("flex shrink-0 items-center justify-center rounded-full", t.icon, size === "sm" ? "size-8" : "size-11")}>
            <Icon className={size === "sm" ? "size-4" : "size-5"} />
          </span>
        )}
        <div className="min-w-0">
          <p className={cn("text-xs text-muted-foreground", tone === "red" && t.value)}>{label}</p>
          <p className={cn("font-semibold tabular-nums", size === "sm" ? "text-lg" : "text-2xl", t.value)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
