"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateManualInvoiceDraft } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InvoiceLineItemsEditor, emptyLineItem, type LineItem } from "./invoice-line-items-editor";

// Line items + notes only — the fields that stay meaningfully editable
// before anything's actually happened yet (see updateManualInvoiceDraft
// in src/lib/actions/invoices.ts for the exact gate). Client/case, profile,
// and dates are set once at creation and aren't part of this.
export function EditManualInvoiceDialog({
  invoiceId,
  notes,
  lineItems,
}: {
  invoiceId: string;
  notes: string | null;
  lineItems: LineItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [notesValue, setNotesValue] = useState(notes ?? "");
  const [items, setItems] = useState<LineItem[]>(lineItems.length ? lineItems : [emptyLineItem()]);

  const subtotal = items.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

  function handleSubmit() {
    const cleanItems = items.filter((li) => li.description.trim().length > 0);
    if (cleanItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    startTransition(async () => {
      try {
        await updateManualInvoiceDraft(invoiceId, { notes: notesValue || undefined, lineItems: cleanItems });
        toast.success("Invoice updated");
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update invoice");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline"><Pencil className="size-3.5" /> Edit</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <InvoiceLineItemsEditor lineItems={items} onChange={setItems} />

          <div className="space-y-1">
            <Label htmlFor="edit-notes">Notes</Label>
            <Textarea
              id="edit-notes"
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Optional note printed on the invoice"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Subtotal (tax not calculated)</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={isPending}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
