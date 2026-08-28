"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type LineItem = { description: string; quantity: number; unitPrice: number };

export function emptyLineItem(): LineItem {
  return { description: "", quantity: 1, unitPrice: 0 };
}

// Shared row editor for a plain description/qty/unit-price line, used by
// both InvoiceFormDialog (a real, Stripe-bound invoice) and
// RecordPaymentDialog (an already-paid, never-sent-to-Stripe record) — same
// shape, same math, only what happens to it afterward differs.
export function InvoiceLineItemsEditor({
  lineItems,
  onChange,
}: {
  lineItems: LineItem[];
  onChange: (next: LineItem[]) => void;
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
              min={1}
              value={item.quantity}
              onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) || 1 })}
              className="w-16"
              title="Quantity"
            />
            <Input
              type="number"
              min={0}
              step="0.01"
              value={item.unitPrice}
              onChange={(e) => updateLineItem(index, { unitPrice: Number(e.target.value) || 0 })}
              className="w-24"
              title="Unit price"
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
