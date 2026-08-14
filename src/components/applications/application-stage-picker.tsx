"use client";

import { changeApplicationStage } from "@/lib/actions/stage";
import { StagePicker, PickerStage } from "@/components/shared/stage-picker";

export function ApplicationStagePicker({
  applicationId,
  currentStage,
  stages,
}: {
  applicationId: string;
  currentStage: { abbrev: string; name: string; hex: string } | null;
  stages: PickerStage[];
}) {
  return (
    <StagePicker
      currentStage={currentStage}
      stages={stages}
      onChange={(stageId, opts) => changeApplicationStage(applicationId, stageId, opts)}
    />
  );
}
