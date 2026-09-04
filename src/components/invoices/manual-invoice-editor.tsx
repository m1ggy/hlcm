"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateManualInvoiceDraft } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceLineItemsEditor, emptyLineItem, type LineItem } from "./invoice-line-items-editor";

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

// Inline replacement for the read-only "Line items" card content — shown
// in place of it (not in a dialog) whenever the invoice still qualifies
// for editing, so there's no click-to-open step between landing on the
// page and changing something. See updateManualInvoiceDraft in
// src/lib/actions/invoices.ts for the exact gate/guard.
export function ManualInvoiceEditor({
  invoiceId,
  notes,
  internalTag,
  issueDate,
  dueDate,
  lineItems,
}: {
  invoiceId: string;
  notes: string | null;
  internalTag: string | null;
  issueDate: Date;
  dueDate: Date | null;
  lineItems: LineItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [internalTagValue, setInternalTagValue] = useState(internalTag ?? "");
  const [issueDateValue, setIssueDateValue] = useState(toDateInputValue(issueDate));
  const [dueDateValue, setDueDateValue] = useState(toDateInputValue(dueDate));
  const [items, setItems] = useState<LineItem[]>(lineItems.length ? lineItems : [emptyLineItem()]);

  const subtotal = items.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

  function handleSave() {
    const cleanItems = items.filter((li) => li.description.trim().length > 0);
    if (cleanItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    startTransition(async () => {
      try {
        await updateManualInvoiceDraft(invoiceId, {
          notes: notesValue || undefined,
          internalTag: internalTagValue || undefined,
          issueDate: issueDateValue || undefined,
          dueDate: dueDateValue || undefined,
          lineItems: cleanItems,
        });
        toast.success("Invoice updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update invoice");
      }
    });
  }

  return (
    <div className="space-y-4">
      <InvoiceLineItemsEditor lineItems={items} onChange={setItems} />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="editIssueDate">Issue date</Label>
          <Input id="editIssueDate" type="date" value={issueDateValue} onChange={(e) => setIssueDateValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="editDueDate">Due date</Label>
          <Input id="editDueDate" type="date" value={dueDateValue} onChange={(e) => setDueDateValue(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="editNotes">Notes</Label>
        <Textarea
          id="editNotes"
          value={notesValue}
          onChange={(e) => setNotesValue(e.target.value)}
          placeholder="Optional note printed on the invoice"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="editInternalTag">Internal Tag <span className="font-normal text-muted-foreground">(staff only — never shown to the client)</span></Label>
        <Input
          id="editInternalTag"
          value={internalTagValue}
          onChange={(e) => setInternalTagValue(e.target.value)}
          placeholder="e.g. referred by Sarah, rush job"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Subtotal (tax not calculated)</span>
        <span className="font-medium">${subtotal.toFixed(2)}</span>
      </div>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </div>
  );
}
