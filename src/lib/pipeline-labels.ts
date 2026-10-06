// Split out from pipeline.ts on purpose: that file imports prisma, which
// pulls the `pg` driver (Node builtins: dns/fs/net/tls) into any client
// component that imports it — breaks the browser bundle. This file has zero
// runtime imports so client components can safely use it.
import type { $Enums } from "@/generated/prisma/client";

export type PipelineKey = $Enums.Pipeline;

/** The three pipelines, in the order the Applications tabs show them. */
export const PIPELINES: PipelineKey[] = ["HOME_CARE", "CILA_GROUP_HOME", "MCO"];

/** Built-in names — what a workspace sees until it renames a pipeline. */
export const PIPELINE_LABELS: Record<PipelineKey, string> = {
  HOME_CARE: "Home Care",
  CILA_GROUP_HOME: "CILA / Group Home",
  MCO: "MCO",
};

/** A workspace's own pipeline names and hidden pipelines (Organization.pipelineSettings). */
export type PipelineSettings = Partial<Record<PipelineKey, { label?: string; hidden?: boolean }>>;

/** Every pipeline's display name for this workspace. */
export function pipelineLabels(settings: PipelineSettings | null | undefined): Record<PipelineKey, string> {
  return Object.fromEntries(PIPELINES.map((p) => [p, settings?.[p]?.label?.trim() || PIPELINE_LABELS[p]])) as Record<PipelineKey, string>;
}

/** The pipelines this workspace uses (not hidden), in tab order. Never empty. */
export function visiblePipelines(settings: PipelineSettings | null | undefined): PipelineKey[] {
  const visible = PIPELINES.filter((p) => !settings?.[p]?.hidden);
  return visible.length ? visible : PIPELINES;
}
