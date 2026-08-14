"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateApplication, updateApplicationCaseFields } from "@/lib/actions/applications";
import { ApplicationStagePicker } from "@/components/applications/application-stage-picker";
import type { PickerStage } from "@/components/shared/stage-picker";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { APPLICATION_STATUSES, STATUS_LABELS, ApplicationStatus } from "@/lib/status";

type Option = { id: string; name: string; role?: string };

const AGENCY_LABELS: Record<string, string> = { IDPH: "IDPH", IDOA: "IDoA", IDHS: "IDHS", OTHER: "Other" };
const BALL_WITH_LABELS: Record<string, string> = { CTK: "CTK", CLIENT: "Client", GOVERNMENT: "Government" };
const NONE = "__none__";

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

export function ApplicationPropertiesTable({
  applicationId,
  defaultValues,
  clients,
  assignableUsers,
  licenseTypeName,
  caseTypeName,
  stage,
  reachableStages,
}: {
  applicationId: string;
  defaultValues: {
    clientId: string;
    name: string;
    description: string | null;
    assignedUserId: string;
    assignedManagerId: string | null;
    status: ApplicationStatus;
    agency: string | null;
    ballIsWith: string | null;
    correctionRound: number | null;
    deficiencyReceivedDate: Date | null;
    deficiencyResponseDueDate: Date | null;
    deficiencyResponseSubmittedDate: Date | null;
  };
  clients: Option[];
  assignableUsers: Option[];
  licenseTypeName: string | null;
  caseTypeName: string | null;
  // Both null when the case predates the pipeline rollout and hasn't been
  // backfilled yet, or its license type doesn't map to a pipeline.
  stage: { abbrev: string; name: string; hex: string } | null;
  reachableStages: PickerStage[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(defaultValues.name);
  const [clientId, setClientId] = useState(defaultValues.clientId);
  const [assignedUserId, setAssignedUserId] = useState(defaultValues.assignedUserId);
  const [status, setStatus] = useState<ApplicationStatus>(defaultValues.status);
  const [description, setDescription] = useState(defaultValues.description ?? "");

  const [assignedManagerId, setAssignedManagerId] = useState(defaultValues.assignedManagerId ?? NONE);
  const [agency, setAgency] = useState(defaultValues.agency ?? NONE);
  const [ballIsWith, setBallIsWith] = useState(defaultValues.ballIsWith ?? NONE);
  const [correctionRound, setCorrectionRound] = useState(
    defaultValues.correctionRound === null ? "" : String(defaultValues.correctionRound)
  );
  const [deficiencyReceivedDate, setDeficiencyReceivedDate] = useState(
    toDateInputValue(defaultValues.deficiencyReceivedDate)
  );
  const [deficiencyResponseDueDate, setDeficiencyResponseDueDate] = useState(
    toDateInputValue(defaultValues.deficiencyResponseDueDate)
  );
  const [deficiencyResponseSubmittedDate, setDeficiencyResponseSubmittedDate] = useState(
    toDateInputValue(defaultValues.deficiencyResponseSubmittedDate)
  );

  const managers = assignableUsers.filter((u) => u.role === "MANAGER" || u.role === "ADMIN");

  function save(overrides: Partial<{ name: string; clientId: string; assignedUserId: string; status: string; description: string }>) {
    const formData = new FormData();
    formData.set("name", overrides.name ?? name);
    formData.set("clientId", overrides.clientId ?? clientId);
    formData.set("assignedUserId", overrides.assignedUserId ?? assignedUserId);
    formData.set("status", overrides.status ?? status);
    formData.set("description", overrides.description ?? description);
    startTransition(async () => {
      try {
        await updateApplication(applicationId, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update application");
      }
    });
  }

  function saveCaseFields(
    overrides: Partial<{
      assignedManagerId: string;
      agency: string;
      ballIsWith: string;
      correctionRound: string;
      deficiencyReceivedDate: string;
      deficiencyResponseDueDate: string;
      deficiencyResponseSubmittedDate: string;
    }>
  ) {
    const formData = new FormData();
    const managerValue = overrides.assignedManagerId ?? assignedManagerId;
    const agencyValue = overrides.agency ?? agency;
    const ballIsWithValue = overrides.ballIsWith ?? ballIsWith;
    formData.set("assignedManagerId", managerValue === NONE ? "" : managerValue);
    formData.set("agency", agencyValue === NONE ? "" : agencyValue);
    formData.set("ballIsWith", ballIsWithValue === NONE ? "" : ballIsWithValue);
    formData.set("correctionRound", overrides.correctionRound ?? correctionRound);
    formData.set("deficiencyReceivedDate", overrides.deficiencyReceivedDate ?? deficiencyReceivedDate);
    formData.set("deficiencyResponseDueDate", overrides.deficiencyResponseDueDate ?? deficiencyResponseDueDate);
    formData.set(
      "deficiencyResponseSubmittedDate",
      overrides.deficiencyResponseSubmittedDate ?? deficiencyResponseSubmittedDate
    );
    startTransition(async () => {
      try {
        await updateApplicationCaseFields(applicationId, formData);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update case fields");
      }
    });
  }

  return (
    <Table>
      <TableBody>
        <TableRow>
          <TableCell className="w-40 text-muted-foreground">Name</TableCell>
          <TableCell>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => save({ name })}
              className="h-8"
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Client</TableCell>
          <TableCell>
            <Select
              items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
              value={clientId}
              onValueChange={(v) => {
                const next = v ?? clientId;
                setClientId(next);
                save({ clientId: next });
              }}
            >
              <SelectTrigger size="sm" className="w-[14rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Assigned VA</TableCell>
          <TableCell>
            <Select
              items={Object.fromEntries(assignableUsers.map((u) => [u.id, u.name]))}
              value={assignedUserId}
              onValueChange={(v) => {
                const next = v ?? assignedUserId;
                setAssignedUserId(next);
                save({ assignedUserId: next });
              }}
            >
              <SelectTrigger size="sm" className="w-[14rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Assigned Manager</TableCell>
          <TableCell>
            <Select
              items={{ [NONE]: "None", ...Object.fromEntries(managers.map((u) => [u.id, u.name])) }}
              value={assignedManagerId}
              onValueChange={(v) => {
                const next = v ?? assignedManagerId;
                setAssignedManagerId(next);
                saveCaseFields({ assignedManagerId: next });
              }}
            >
              <SelectTrigger size="sm" className="w-[14rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {managers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Status</TableCell>
          <TableCell>
            <Select
              items={Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, STATUS_LABELS[s]]))}
              value={status}
              onValueChange={(v) => {
                const next = (v ?? status) as ApplicationStatus;
                setStatus(next);
                save({ status: next });
              }}
            >
              <SelectTrigger size="sm" className="w-[14rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLICATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Pipeline Stage</TableCell>
          <TableCell>
            {stage ? (
              <ApplicationStagePicker applicationId={applicationId} currentStage={stage} stages={reachableStages} />
            ) : (
              <span className="text-sm text-muted-foreground">
                Not on a pipeline yet — set a license type to enable stage tracking.
              </span>
            )}
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">License Type</TableCell>
          <TableCell className="text-muted-foreground">{licenseTypeName ?? "—"}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Case Type</TableCell>
          <TableCell className="text-muted-foreground">{caseTypeName ?? "—"}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Agency</TableCell>
          <TableCell>
            <Select
              items={{ [NONE]: "None", ...AGENCY_LABELS }}
              value={agency}
              onValueChange={(v) => {
                const next = v ?? agency;
                setAgency(next);
                saveCaseFields({ agency: next });
              }}
            >
              <SelectTrigger size="sm" className="w-[14rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {Object.entries(AGENCY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Ball is with</TableCell>
          <TableCell>
            <Select
              items={{ [NONE]: "None", ...BALL_WITH_LABELS }}
              value={ballIsWith}
              onValueChange={(v) => {
                const next = v ?? ballIsWith;
                setBallIsWith(next);
                saveCaseFields({ ballIsWith: next });
              }}
            >
              <SelectTrigger size="sm" className="w-[14rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {Object.entries(BALL_WITH_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Correction round</TableCell>
          <TableCell>
            <Input
              type="number"
              min={0}
              value={correctionRound}
              onChange={(e) => setCorrectionRound(e.target.value)}
              onBlur={() => saveCaseFields({ correctionRound })}
              className="h-8 w-24"
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Deficiency received</TableCell>
          <TableCell>
            <Input
              type="date"
              value={deficiencyReceivedDate}
              onChange={(e) => setDeficiencyReceivedDate(e.target.value)}
              onBlur={() => saveCaseFields({ deficiencyReceivedDate })}
              className="h-8 w-[10.5rem]"
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Deficiency response due</TableCell>
          <TableCell>
            <Input
              type="date"
              value={deficiencyResponseDueDate}
              onChange={(e) => setDeficiencyResponseDueDate(e.target.value)}
              onBlur={() => saveCaseFields({ deficiencyResponseDueDate })}
              className="h-8 w-[10.5rem]"
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Deficiency response submitted</TableCell>
          <TableCell>
            <Input
              type="date"
              value={deficiencyResponseSubmittedDate}
              onChange={(e) => setDeficiencyResponseSubmittedDate(e.target.value)}
              onBlur={() => saveCaseFields({ deficiencyResponseSubmittedDate })}
              className="h-8 w-[10.5rem]"
            />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Description</TableCell>
          <TableCell>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => save({ description })}
              className="h-8"
            />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
