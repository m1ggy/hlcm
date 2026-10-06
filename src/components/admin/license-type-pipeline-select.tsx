"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateLicenseTypePipeline } from "@/lib/actions/license-types";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Inline pipeline picker on Admin > License Types. Changing it only affects
// cases created (or re-typed) afterwards — open cases keep their pipeline.
export function LicenseTypePipelineSelect({ id, value, pipelines }: { id: string; value: string; pipelines: { value: string; label: string }[] }) {
  const [current, setCurrent] = useState(value);
  const [isPending, start] = useTransition();

  function change(next: string | null) {
    if (!next || next === current) return;
    const previous = current;
    setCurrent(next);
    start(async () => {
      try {
        await updateLicenseTypePipeline(id, next);
        toast.success("Pipeline updated — new cases with this license type will use it");
      } catch (error) {
        setCurrent(previous);
        toast.error(error instanceof Error ? error.message : "Failed to update the pipeline");
      }
    });
  }

  return (
    <SearchableSelect
      items={Object.fromEntries(pipelines.map((p) => [p.value, p.label]))}
      value={current}
      onValueChange={change}
      searchPlaceholder="Search pipelines..."
      disabled={isPending}
    />
  );
}
