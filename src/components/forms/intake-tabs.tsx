import Link from "next/link";
import { cn } from "@/lib/utils";

/** Forms area tabs: the submissions inbox and the forms themselves. */
export function IntakeTabs({ current, pending }: { current: "submissions" | "forms"; pending?: number }) {
  const tab = (key: "submissions" | "forms", href: string, label: React.ReactNode) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", current === key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );
  return (
    <nav className="inline-flex gap-1 rounded-lg bg-muted p-1" aria-label="Forms">
      {tab(
        "submissions",
        "/intake",
        <>
          Submissions
          {pending ? <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">{pending}</span> : null}
        </>
      )}
      {tab("forms", "/intake/forms", "Forms")}
    </nav>
  );
}
