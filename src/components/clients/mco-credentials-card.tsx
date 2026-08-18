"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createMcoCredential } from "@/lib/actions/mco";
import { McoStagePicker } from "@/components/clients/mco-stage-picker";
import type { PickerStage } from "@/components/shared/stage-picker";
import { PipelineDiagramDialog, type DiagramStage } from "@/components/shared/pipeline-diagram";
import { StageLegendStrip } from "@/components/applications/stage-legend-strip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MCO_LABELS: Record<string, string> = {
  AETNA: "Aetna",
  BCBS_IL: "BCBS IL",
  COUNTY_CARE: "CountyCare",
  HUMANA: "Humana",
  MERIDIAN: "Meridian",
  MOLINA: "Molina",
  OTHER: "Other",
};

type Stage = { id: string; abbrev: string; name: string; hex: string };
type Credential = {
  id: string;
  mcoName: string;
  npi: string | null;
  providerId: string | null;
  effectiveDate: Date | null;
  recredentialingDueDate: Date | null;
  stage: Stage | null;
  reachableStages: PickerStage[];
  daysInStage: number | null;
};

function NewMcoCredentialDialog({ clientId, existing }: { clientId: string; existing: string[] }) {
  const [open, setOpen] = useState(false);
  const [mcoName, setMcoName] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const available = Object.entries(MCO_LABELS).filter(([value]) => !existing.includes(value));

  function handleCreate() {
    if (!mcoName) return;
    startTransition(async () => {
      try {
        await createMcoCredential(clientId, mcoName as Parameters<typeof createMcoCredential>[1]);
        toast.success("MCO credentialing record added");
        setOpen(false);
        setMcoName("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add MCO");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add MCO</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start credentialing with a new MCO</DialogTitle>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">Already credentialing with every MCO on the list.</p>
        ) : (
          <div className="space-y-4">
            <Select items={Object.fromEntries(available)} value={mcoName} onValueChange={(v) => setMcoName(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an MCO" />
              </SelectTrigger>
              <SelectContent>
                {available.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCreate} disabled={!mcoName || isPending} className="w-full">
              Add
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Client profile renders every MCO credentialing record side by side — one
// row per MCO, never one per client (docs/pipeline-stage-plan.md). Stage
// color comes straight from the seeded PipelineStage catalog, not a
// hardcoded badge variant.
export function McoCredentialsCard({
  clientId,
  credentials,
  mcoStages,
}: {
  clientId: string;
  credentials: Credential[];
  mcoStages: DiagramStage[];
}) {
  const forwardStages = mcoStages.filter((s) => !s.isExitStatus).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">MCO Credentialing</h2>
          <div className="flex items-center gap-2">
            <PipelineDiagramDialog
              pipeline="MCO"
              pipelineLabel="MCO Credentialing"
              stages={mcoStages}
              autoOpenKey="MCO"
            />
            <NewMcoCredentialDialog clientId={clientId} existing={credentials.map((c) => c.mcoName)} />
          </div>
        </div>
        {credentials.length > 0 && <StageLegendStrip stages={mcoStages} />}
        {credentials.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not credentialing with any MCOs yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {credentials.map((c) => {
              const stepIndex = c.stage ? forwardStages.findIndex((s) => s.id === c.stage!.id) : -1;
              return (
                <div key={c.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{MCO_LABELS[c.mcoName] ?? c.mcoName}</span>
                    <McoStagePicker mcoCredentialId={c.id} currentStage={c.stage} stages={c.reachableStages} />
                  </div>
                  {stepIndex !== -1 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Step {stepIndex + 1} of {forwardStages.length} — {c.stage!.name}
                    </p>
                  )}
                  <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                    <div>NPI: {c.npi ?? "—"}</div>
                    <div>Provider ID: {c.providerId ?? "—"}</div>
                    <div>
                      Recredentialing due:{" "}
                      {c.recredentialingDueDate ? new Date(c.recredentialingDueDate).toLocaleDateString() : "—"}
                    </div>
                    <div>
                      Days in stage:{" "}
                      {c.daysInStage === null
                        ? "—"
                        : c.daysInStage === 0
                          ? "Today"
                          : `${c.daysInStage} day${c.daysInStage === 1 ? "" : "s"}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
