"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateApplication } from "@/lib/actions/applications";
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

type Option = { id: string; name: string };

export function ApplicationPropertiesTable({
  applicationId,
  defaultValues,
  clients,
  assignableUsers,
  licenseTypeName,
  caseTypeName,
}: {
  applicationId: string;
  defaultValues: {
    clientId: string;
    name: string;
    description: string | null;
    assignedUserId: string;
    status: ApplicationStatus;
  };
  clients: Option[];
  assignableUsers: Option[];
  licenseTypeName: string | null;
  caseTypeName: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(defaultValues.name);
  const [clientId, setClientId] = useState(defaultValues.clientId);
  const [assignedUserId, setAssignedUserId] = useState(defaultValues.assignedUserId);
  const [status, setStatus] = useState<ApplicationStatus>(defaultValues.status);
  const [description, setDescription] = useState(defaultValues.description ?? "");

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
          <TableCell className="text-muted-foreground">Assigned To</TableCell>
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
          <TableCell className="text-muted-foreground">License Type</TableCell>
          <TableCell className="text-muted-foreground">{licenseTypeName ?? "—"}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="text-muted-foreground">Case Type</TableCell>
          <TableCell className="text-muted-foreground">{caseTypeName ?? "—"}</TableCell>
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
