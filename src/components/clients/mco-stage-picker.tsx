"use client";

import { changeMcoStage } from "@/lib/actions/mco";
import { StagePicker, PickerStage } from "@/components/shared/stage-picker";

export function McoStagePicker({
  mcoCredentialId,
  currentStage,
  stages,
}: {
  mcoCredentialId: string;
  currentStage: { abbrev: string; name: string; hex: string } | null;
  stages: PickerStage[];
}) {
  return (
    <StagePicker
      currentStage={currentStage}
      stages={stages}
      onChange={(stageId, opts) => changeMcoStage(mcoCredentialId, stageId, opts)}
    />
  );
}
