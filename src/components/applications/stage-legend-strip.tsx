import type { DiagramStage } from "@/components/shared/pipeline-diagram";

// Always-visible key for the stage-color pills used in the table/board on a
// pipeline tab — CILA runs 24 forward stages + 3 exits, too many to lay out
// horizontally without overflowing, so this sits as a vertical rail on the
// right instead, scrolling its own list if it runs taller than the content
// beside it.
export function StageLegendStrip({ stages }: { stages: DiagramStage[] }) {
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="w-48 shrink-0 rounded-lg border bg-muted/30 p-2.5">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Stages</p>
      <div className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
        {sorted.map((stage) => (
          <div key={stage.id} className="flex items-center gap-1.5 text-xs" title={stage.name}>
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: stage.hex }}
            />
            <span className="shrink-0 font-medium text-muted-foreground">{stage.abbrev}</span>
            <span className="truncate text-muted-foreground/70">{stage.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
