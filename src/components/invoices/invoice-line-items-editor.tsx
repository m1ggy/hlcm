"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// `id` is set on an existing invoice's lines (ManualInvoiceEditor) so a save
// updates them in place — see updateManualInvoiceDraft.
export type LineItem = { id?: string; description: string; quantity: number; unitPrice: number };

export function emptyLineItem(): LineItem {
  return { description: "", quantity: 1, unitPrice: 0 };
}

// Shared row editor for a plain description/qty/unit-price line, used by
// both InvoiceFormDialog (a real, Stripe-bound invoice) and
// RecordPaymentDialog (an already-paid, never-sent-to-Stripe record) — same
// shape, same math, only what happens to it afterward differs.
//
// `quantityLabel`/`rateLabel` rename the columns for context — manual
// invoices (RecordPaymentDialog, ManualInvoiceEditor, CareRecipientInvoiceForm)
// bill time, so they pass "Hours"/"Rate"; the Stripe-bound InvoiceFormDialog
// keeps the defaults, since its lines aren't always hourly.
export function InvoiceLineItemsEditor({
  lineItems,
  onChange,
  quantityLabel = "Quantity",
  rateLabel = "Unit Price",
}: {
  lineItems: LineItem[];
  onChange: (next: LineItem[]) => void;
  quantityLabel?: string;
  rateLabel?: string;
}) {
  function updateLineItem(index: number, patch: Partial<LineItem>) {
    onChange(lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    onChange([...lineItems, emptyLineItem()]);
  }

  function removeLineItem(index: number) {
    onChange(lineItems.length > 1 ? lineItems.filter((_, i) => i !== index) : lineItems);
  }

  return (
    <div className="space-y-2">
      <Label>Line items</Label>
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1">Description</span>
          <span className="w-16">{quantityLabel}</span>
          <span className="w-24">{rateLabel}</span>
          <span className="w-7" />
        </div>
        {lineItems.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <Input
              placeholder="Description"
              value={item.description}
              onChange={(e) => updateLineItem(index, { description: e.target.value })}
              className="min-w-0 flex-1"
            />
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={item.quantity}
              onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) || 1 })}
              className="w-16"
              title={quantityLabel}
              aria-label={quantityLabel}
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              value={item.unitPrice}
              onChange={(e) => updateLineItem(index, { unitPrice: Number(e.target.value) || 0 })}
              className="w-24"
              title={rateLabel}
              aria-label={rateLabel}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeLineItem(index)}
              disabled={lineItems.length === 1}
              title="Remove line"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
        <Plus className="size-3.5" /> Add line
      </Button>
    </div>
  );
}
