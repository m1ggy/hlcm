"use client";

import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

export const NO_SERVICE = "__none__";

export type ServiceOption = { id: string; name: string; clientId: string };

/**
 * "Which of this client's services is this for?" — the optional link every
 * invoice/task/file can carry (see ClientService). Renders nothing when the
 * client has no services, so forms for clients that don't use them look
 * exactly as before. `value` is NO_SERVICE for General.
 */
export function ServiceSelect({
  services,
  clientId,
  value,
  onValueChange,
  label = "Service (optional)",
}: {
  services: ServiceOption[];
  clientId: string | null | undefined;
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
}) {
  const clientServices = services.filter((s) => s.clientId === clientId);
  if (clientServices.length === 0) return null;
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <SearchableSelect
        items={{ [NO_SERVICE]: "General (no service)", ...Object.fromEntries(clientServices.map((s) => [s.id, s.name])) }}
        value={value}
        onValueChange={(v) => onValueChange(v ?? NO_SERVICE)}
        searchPlaceholder="Search services..."
      />
    </div>
  );
}
