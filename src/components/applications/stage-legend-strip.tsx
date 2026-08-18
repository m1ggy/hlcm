import type { DiagramStage } from "@/components/shared/pipeline-diagram";

// Always-visible key for the stage-color pills used in the table/board on a
// pipeline tab — CILA runs 24 forward stages + 3 exits, too many to lay out
// as a wrapping grid without dominating the page, so this scrolls
// horizontally in a single row instead (same pattern as a wide table).
export function StageLegendStrip({ stages }: { stages: DiagramStage[] }) {
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="overflow-x-auto rounded-lg border bg-muted/30 px-2.5 py-1.5">
      <div className="flex w-max items-center gap-3">
        {sorted.map((stage) => (
          <span key={stage.id} className="flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap" title={stage.name}>
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: stage.hex }}
            />
            <span className="font-medium text-muted-foreground">{stage.abbrev}</span>
            <span className="text-muted-foreground/70">{stage.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
