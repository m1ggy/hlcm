// Plain SVG bar chart — no charting library in this codebase yet, and a
// single per-day bar chart doesn't need one. Pure markup (no hooks/client
// APIs), so it renders fine from either a server component (MyTimeLog) or
// a client one (TimesheetReport).
import type { DailyHours } from "@/lib/time-entries";
import { formatDuration } from "@/lib/time-entries";

const CHART_HEIGHT = 120;
const AXIS_HEIGHT = 16;
const BAR_SLOT = 24;
const BAR_WIDTH = 16;

/** "9/1" for a "yyyy-mm-dd" day string, read as a plain calendar date (the
 * string is already resolved to the right zone by summarizeByDay — this
 * just formats the digits, it doesn't convert anything). */
function shortDayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function HoursByDayChart({
  data,
  emptyLabel = "No hours in this range.",
}: {
  data: DailyHours[];
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const plotHeight = CHART_HEIGHT - AXIS_HEIGHT;
  const max = Math.max(1, ...data.map((d) => d.hours + d.breakHours));
  const width = data.length * BAR_SLOT;

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-32 w-full"
        role="img"
        aria-label="Hours worked per day"
      >
        <line x1={0} y1={plotHeight} x2={width} y2={plotHeight} stroke="currentColor" strokeWidth={1} className="text-border" />
        {data.map((d, i) => {
          const barHeight = Math.round((d.hours / max) * plotHeight);
          const breakHeight = Math.round((d.breakHours / max) * plotHeight);
          const x = i * BAR_SLOT + (BAR_SLOT - BAR_WIDTH) / 2;
          const tooltip = `${shortDayLabel(d.day)}: ${formatDuration(d.hours)}${
            d.breakHours > 0 ? ` (+${formatDuration(d.breakHours)} break)` : ""
          }`;
          return (
            <g key={d.day}>
              <title>{tooltip}</title>
              <rect
                x={x}
                y={plotHeight - barHeight}
                width={BAR_WIDTH}
                height={Math.max(barHeight, d.hours > 0 ? 1 : 0)}
                rx={2}
                className="fill-primary"
              />
              {d.breakHours > 0 && (
                <rect
                  x={x}
                  y={plotHeight - barHeight - breakHeight}
                  width={BAR_WIDTH}
                  height={Math.max(breakHeight, 1)}
                  rx={2}
                  className="fill-muted-foreground/40"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div
        className="grid text-center text-[10px] text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
      >
        {data.map((d, i) => (
          // Every label at once gets cramped past ~2-3 weeks — thin it out
          // so the ones that do print stay legible.
          <span key={d.day} className="truncate">
            {data.length <= 14 || i % Math.ceil(data.length / 14) === 0 ? shortDayLabel(d.day) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
