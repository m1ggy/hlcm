"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClientService, updateClientService } from "@/lib/actions/client-services";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { SERVICE_STATUSES, SERVICE_STATUS_LABELS, type ServiceStatus } from "@/lib/service-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

export type ServiceFormValues = {
  id: string;
  name: string;
  serviceTypeId: string | null;
  description: string | null;
  status: ServiceStatus;
  startDate: Date | null;
  endDate: Date | null;
  feeAmount: number | null;
  feeFrequency: string | null;
  notes: string | null;
  team: { user: { id: string; name: string } }[];
};

type Option = { id: string; name: string };

function toDateInputValue(date: Date | null | undefined) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Add or edit one ClientService. `service` set = edit. Opens from its own
 * button (`triggerKind`, so a Server Component page can render it without
 * passing a client element across), or
 * or is controlled through `open`/`onOpenChange` when a row menu opens it.
 */
export function ServiceFormDialog({
  clientId,
  service,
  serviceTypes,
  users,
  triggerKind,
  open: controlledOpen,
  onOpenChange,
}: {
  clientId: string;
  service?: ServiceFormValues;
  serviceTypes: Option[];
  users: Option[];
  triggerKind?: "add" | "edit";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const [serviceTypeId, setServiceTypeId] = useState(service?.serviceTypeId ?? NONE);
  const [status, setStatus] = useState<ServiceStatus>(service?.status ?? "PENDING");
  const [teamUserIds, setTeamUserIds] = useState(service?.team.map((t) => t.user.id) ?? []);

  // The picks live in state (the inputs reset themselves when the dialog
  // unmounts its content) — start every opening from the service as it is
  // now, or blank for a new one, never from whatever was picked last time.
  function setOpen(next: boolean) {
    if (next) {
      setServiceTypeId(service?.serviceTypeId ?? NONE);
      setStatus(service?.status ?? "PENDING");
      setTeamUserIds(service?.team.map((t) => t.user.id) ?? []);
    }
    (onOpenChange ?? setUncontrolledOpen)(next);
  }

  function handleSubmit(formData: FormData) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    formData.set("clientId", clientId);
    formData.set("status", status);
    if (serviceTypeId !== NONE) formData.set("serviceTypeId", serviceTypeId);
    for (const id of teamUserIds) formData.append("teamUserIds", id);
    startTransition(async () => {
      try {
        const result = service ? await updateClientService(service.id, formData) : await createClientService(formData);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(service ? "Service updated" : "Service added");
        setOpen(false);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, service ? "Failed to update service" : "Failed to add service"));
      } finally {
        submittingRef.current = false;
      }
    });
  }

  // Team members who were since deactivated still show (and stay) on an
  // existing service rather than silently dropping off on the next save.
  const userItems = Object.fromEntries([
    ...(service?.team.map((t) => [t.user.id, t.user.name]) ?? []),
    ...users.map((u) => [u.id, u.name]),
  ]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerKind && (
        <DialogTrigger
          render={
            triggerKind === "add" ? (
              <Button>
                <Plus className="size-4" /> Add Service
              </Button>
            ) : (
              <Button variant="outline">
                <Pencil className="size-3.5" /> Edit Service
              </Button>
            )
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add service"}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="service-name">Name</Label>
              <Input id="service-name" name="name" required placeholder="e.g. Payroll Services" defaultValue={service?.name} />
            </div>
            <div className="space-y-1">
              <Label>Service type</Label>
              <Select
                items={{ [NONE]: "None", ...Object.fromEntries(serviceTypes.map((t) => [t.id, t.name])) }}
                value={serviceTypeId}
                onValueChange={(v) => setServiceTypeId(v ?? NONE)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {serviceTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                items={SERVICE_STATUS_LABELS}
                value={status}
                onValueChange={(v) => setStatus((v as ServiceStatus) ?? status)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SERVICE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="service-start">Start date</Label>
              <Input id="service-start" name="startDate" type="date" defaultValue={toDateInputValue(service?.startDate)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="service-end">Renewal/end date</Label>
              <Input id="service-end" name="endDate" type="date" defaultValue={toDateInputValue(service?.endDate)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="service-fee">Fee</Label>
              <Input
                id="service-fee"
                name="feeAmount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                defaultValue={service?.feeAmount ?? ""}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="service-fee-frequency">Fee frequency</Label>
              <Input
                id="service-fee-frequency"
                name="feeFrequency"
                placeholder="e.g. per month, one-time"
                defaultValue={service?.feeFrequency ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Assigned team</Label>
            <MultiUserSelect items={userItems} value={teamUserIds} onValueChange={setTeamUserIds} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="service-description">Description</Label>
            <Input id="service-description" name="description" defaultValue={service?.description ?? ""} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="service-notes">Notes</Label>
            <Textarea id="service-notes" name="notes" rows={3} defaultValue={service?.notes ?? ""} />
          </div>
          <Button type="submit" className="w-full" loading={isPending}>
            {service ? "Save" : "Add service"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
