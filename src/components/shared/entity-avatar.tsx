import { cn } from "@/lib/utils";

const TONES = {
  blue: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  red: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
} as const;

/** "CA" / "SX" — the round initials badge on the client and service headers. */
export function EntityAvatar({ name, tone = "blue", className }: { name: string; tone?: keyof typeof TONES; className?: string }) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.slice(0, 2)).toUpperCase();
  return (
    <span
      className={cn(
        "flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-semibold tracking-tight",
        TONES[tone],
        className
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
