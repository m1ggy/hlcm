"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setInvoiceService } from "@/lib/actions/invoices";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NO_SERVICE } from "@/components/clients/service-select";

// The invoice page's "Service" row — which of the client's services this
// invoice counts toward. Editable at any status (see setInvoiceService).
export function InvoiceServicePicker({
  invoiceId,
  services,
  value,
}: {
  invoiceId: string;
  services: { id: string; name: string }[];
  value: string | null;
}) {
  const [current, setCurrent] = useState(value ?? NO_SERVICE);
  const [isPending, startTransition] = useTransition();

  function change(next: string) {
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      try {
        const result = await setInvoiceService(invoiceId, next === NO_SERVICE ? "" : next);
        if (!result.ok) {
          setCurrent(previous);
          toast.error(result.error);
        }
      } catch (error) {
        setCurrent(previous);
        toast.error(unexpectedErrorMessage(error, "Failed to change the service"));
      }
    });
  }

  return (
    <Select
      items={{ [NO_SERVICE]: "General", ...Object.fromEntries(services.map((s) => [s.id, s.name])) }}
      value={current}
      onValueChange={(v) => change(v ?? NO_SERVICE)}
    >
      <SelectTrigger size="sm" className="h-7 max-w-[12rem]" disabled={isPending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={NO_SERVICE}>General</SelectItem>
        {services.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
