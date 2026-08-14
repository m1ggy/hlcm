"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProjectServiceType } from "@/lib/actions/projects";
import { ServicePill } from "@/components/shared/service-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

type ServiceType = { id: string; name: string; hex: string; textColor: string };

export function ServiceTypeSelect({
  projectId,
  serviceTypeId,
  serviceTypes,
}: {
  projectId: string;
  serviceTypeId: string | null;
  serviceTypes: ServiceType[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(serviceTypeId ?? NONE);
  const [isPending, startTransition] = useTransition();

  const current = serviceTypes.find((s) => s.id === value) ?? null;

  return (
    <div className="flex items-center gap-2">
      <ServicePill label={current?.name ?? "Unmapped"} service={current} />
      <Select
        items={{ [NONE]: "Unmapped (default)", ...Object.fromEntries(serviceTypes.map((s) => [s.id, s.name])) }}
        value={value}
        onValueChange={(v) => {
          const next = v ?? value;
          setValue(next);
          startTransition(async () => {
            try {
              await updateProjectServiceType(projectId, next === NONE ? "" : next);
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to update service type");
            }
          });
        }}
      >
        <SelectTrigger size="sm" className="w-[12rem]" disabled={isPending}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Unmapped (default)</SelectItem>
          {serviceTypes.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
