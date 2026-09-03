// Plain SVG timeline — no charting library in this codebase yet, and one
// chart doesn't need one. One row per day, spanning a full 24-hour track;
// each clocked-in session is its own highlighted bar segment on that row,
// so a gap in the highlight reads as time not clocked in (the stretch
// between one shift ending and the next starting) rather than being netted
// away into a single daily total. Breaks (see BreakEntry), when passed via
// `breakData`, render as their own amber segment rather than just an
// unlabeled gap — and `compliance` marks any worked day short of the
// 30-minute break policy.
//
// Day/hour labels are plain HTML, not SVG <text> — the chart stretches
// non-uniformly to fill its container (preserveAspectRatio="none"), which
// is harmless for rects and lines but would visibly squish glyphs.
import type { DayBreakStatus, DaySegments } from "@/lib/time-entries";

const ROW_HEIGHT = 18;
const ROW_GAP = 6;
const HOUR_WIDTH = 20;
const HOUR_MARKS = [0, 6, 12, 18, 24];

/** "9/1" for a "yyyy-mm-dd" day string, read as a plain calendar date (the
 * string is already resolved to the right zone by segmentsByDay — this
 * just formats the digits, it doesn't convert anything). */
function shortDayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "9:03 AM" for an hours-since-midnight value (0–24). */
function hourLabel(hour: number) {
  const totalMinutes = Math.round(hour * 60);
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "12am" / "6pm" — axis tick labels, only ever called with HOUR_MARKS values. */
function axisLabel(hour: number) {
  if (hour === 0 || hour === 24) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export function DailyTimelineChart({
  data,
  breakData,
  compliance,
  emptyLabel = "No sessions in this range.",
}: {
  data: DaySegments[];
  /** Same days as `data` — rendered as amber segments instead of plain gaps. */
  breakData?: DaySegments[];
  /** Same days as `data` — flags a day's label when it fails the 30-minute break policy. */
  compliance?: DayBreakStatus[];
  emptyLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const plotHeight = data.length * ROW_HEIGHT + (data.length - 1) * ROW_GAP;
  const width = 24 * HOUR_WIDTH;
  const breaksByDay = new Map((breakData ?? []).map((d) => [d.day, d.segments]));
  const complianceByDay = new Map((compliance ?? []).map((c) => [c.day, c]));

  return (
    <div className="flex gap-2">
      <div className="flex flex-col text-[10px] text-muted-foreground" style={{ gap: ROW_GAP }}>
        {data.map((d) => {
          const status = complianceByDay.get(d.day);
          const flagged = status && !status.meetsBreakPolicy;
          return (
            <div key={d.day} className="flex items-center gap-1" style={{ height: ROW_HEIGHT }}>
              {shortDayLabel(d.day)}
              {flagged && (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-amber-500"
                  title={`No 30-minute break: worked ${Math.round(status.workedHours * 60)}m, only ${status.breakMinutes}m break`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <svg
          viewBox={`0 0 ${width} ${plotHeight}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: plotHeight }}
          role="img"
          aria-label="Clock in/out times per day, over 24 hours"
        >
          {HOUR_MARKS.map((hour) => (
            <line
              key={hour}
              x1={hour * HOUR_WIDTH}
              y1={0}
              x2={hour * HOUR_WIDTH}
              y2={plotHeight}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border"
            />
          ))}
          {data.map((d, i) => {
            const y = i * (ROW_HEIGHT + ROW_GAP);
            return (
              <g key={d.day}>
                <rect x={0} y={y} width={width} height={ROW_HEIGHT} rx={3} className="fill-muted/40" />
                {d.segments.map((s, si) => (
                  <rect
                    key={si}
                    x={s.startHour * HOUR_WIDTH}
                    y={y}
                    width={Math.max((s.endHour - s.startHour) * HOUR_WIDTH, 1.5)}
                    height={ROW_HEIGHT}
                    rx={3}
                    className="fill-primary"
                  >
                    <title>
                      {`${shortDayLabel(d.day)}: ${hourLabel(s.startHour)} – ${hourLabel(s.endHour)}`}
                    </title>
                  </rect>
                ))}
                {(breaksByDay.get(d.day) ?? []).map((s, si) => (
                  <rect
                    key={si}
                    x={s.startHour * HOUR_WIDTH}
                    y={y}
                    width={Math.max((s.endHour - s.startHour) * HOUR_WIDTH, 1.5)}
                    height={ROW_HEIGHT}
                    rx={3}
                    className="fill-amber-500"
                  >
                    <title>
                      {`${shortDayLabel(d.day)} break: ${hourLabel(s.startHour)} – ${hourLabel(s.endHour)}`}
                    </title>
                  </rect>
                ))}
              </g>
            );
          })}
        </svg>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          {HOUR_MARKS.map((hour, i) => (
            <span key={hour} className={i === 0 ? "" : i === HOUR_MARKS.length - 1 ? "text-right" : "text-center"}>
              {axisLabel(hour)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
