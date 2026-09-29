"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setInvoicePdfTemplate } from "@/lib/actions/invoices";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PDF_TEMPLATE_LABELS, type PdfTemplateId } from "@/lib/pdf-templates/options";

const PROFILE_DEFAULT = "__profile_default__";

// This invoice's PDF layout — the profile's choice unless overridden here.
// Changes the next download/email right away; nothing's regenerated.
export function InvoiceTemplateSelect({
  invoiceId,
  value,
  profileTemplate,
}: {
  invoiceId: string;
  value: PdfTemplateId | null;
  profileTemplate: PdfTemplateId;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const items = {
    [PROFILE_DEFAULT]: `Profile default (${PDF_TEMPLATE_LABELS[profileTemplate]})`,
    ...PDF_TEMPLATE_LABELS,
  };

  function handleChange(next: string | null) {
    const template = !next || next === PROFILE_DEFAULT ? null : (next as PdfTemplateId);
    if (template === value) return;
    startTransition(async () => {
      try {
        await setInvoicePdfTemplate(invoiceId, template);
        toast.success("PDF layout updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to change the PDF layout");
      }
    });
  }

  return (
    <Select items={items} value={value ?? PROFILE_DEFAULT} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger size="sm" className="w-[12rem]" aria-label="PDF layout">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
