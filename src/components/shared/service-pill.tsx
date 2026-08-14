import { UNMAPPED_SERVICE_COLOR } from "@/lib/service-type";

// The project tag pill on the Clients list — filled with the project's
// ServiceType color, or the neutral default when unset. Kept visually
// distinct from a stage chip on purpose (docs/pipeline-stage-plan.md: "the
// project pill and the stage chip sit side by side and never swap roles —
// the pill answers which service, the chip answers what is happening").
export function ServicePill({
  label,
  service,
}: {
  label: string;
  service: { hex: string; textColor: string } | null;
}) {
  const { hex, textColor } = service ?? UNMAPPED_SERVICE_COLOR;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: hex, color: textColor }}
    >
      {label}
    </span>
  );
}
