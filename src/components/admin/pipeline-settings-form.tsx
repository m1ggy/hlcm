"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { savePipelineSettings } from "@/lib/actions/pipelines";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { PIPELINE_LABELS, PIPELINES, type PipelineKey, type PipelineSettings } from "@/lib/pipeline-labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Rename the three pipelines for this workspace, or hide the ones it doesn't
// use (they leave the Applications tabs and the license-type picker).
export function PipelineSettingsForm({ settings, canEdit }: { settings: PipelineSettings; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [rows, setRows] = useState(() =>
    PIPELINES.map((p) => ({ pipeline: p, label: settings[p]?.label ?? PIPELINE_LABELS[p], hidden: Boolean(settings[p]?.hidden) }))
  );

  function set(pipeline: PipelineKey, patch: Partial<{ label: string; hidden: boolean }>) {
    setRows((rs) => rs.map((r) => (r.pipeline === pipeline ? { ...r, ...patch } : r)));
  }

  function save() {
    start(async () => {
      try {
        const result = await savePipelineSettings(rows);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Pipelines saved");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Failed to save pipelines"));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipelines</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every case runs through one of these, chosen by its license type. Rename them to match how you work, or hide the
          ones you don&apos;t use.
        </p>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.pipeline} className="flex flex-wrap items-center gap-3">
              <Input
                id={`pipeline-${r.pipeline}`}
                aria-label={`Name for ${PIPELINE_LABELS[r.pipeline]}`}
                value={r.label}
                onChange={(e) => set(r.pipeline, { label: e.target.value })}
                disabled={!canEdit || isPending}
                className="max-w-xs"
              />
              {r.label.trim() !== PIPELINE_LABELS[r.pipeline] && (
                <span className="text-xs text-muted-foreground">Built-in: {PIPELINE_LABELS[r.pipeline]}</span>
              )}
              <label className="ml-auto flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`pipeline-hidden-${r.pipeline}`}
                  checked={r.hidden}
                  onChange={(e) => set(r.pipeline, { hidden: e.target.checked })}
                  disabled={!canEdit || isPending}
                  className="size-4"
                />
                Hide
              </label>
            </div>
          ))}
        </div>
        {canEdit && (
          <Button onClick={save} loading={isPending}>
            Save pipelines
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
