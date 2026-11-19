"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// `id` is set on an existing invoice's lines (ManualInvoiceEditor) so a save
// updates them in place — see updateManualInvoiceDraft.
// `lineDate` is the date the charge was added (a "yyyy-mm-dd" string from the
// input, or a Date on an existing line) — only edited with `showDate`.
export type LineItem = { id?: string; description: string; quantity: number; unitPrice: number; lineDate?: string | Date | null };

/** Today as a date input's "yyyy-mm-dd", in the browser's own time zone. */
export function todayDateInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  return typeof value === "string" ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10);
}

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
//
// `amountOnly` (a regular manual invoice) drops the quantity column: each
// line is just a description and an amount, saved as quantity 1 at that
// price. An older line with another quantity shows its total until it's
// changed.
//
// `showDate` (a regular manual invoice — a running invoice) adds a Date
// column; a new line starts on today's date.
export function InvoiceLineItemsEditor({
  lineItems,
  onChange,
  quantityLabel = "Quantity",
  rateLabel = "Unit Price",
  amountOnly = false,
  showDate = false,
}: {
  lineItems: LineItem[];
  onChange: (next: LineItem[]) => void;
  quantityLabel?: string;
  rateLabel?: string;
  amountOnly?: boolean;
  showDate?: boolean;
}) {
  function updateLineItem(index: number, patch: Partial<LineItem>) {
    onChange(lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    onChange([...lineItems, showDate ? { ...emptyLineItem(), lineDate: todayDateInput() } : emptyLineItem()]);
  }

  function removeLineItem(index: number) {
    onChange(lineItems.length > 1 ? lineItems.filter((_, i) => i !== index) : lineItems);
  }

  return (
    <div className="space-y-2">
      <Label>Line items</Label>
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-0.5 text-xs text-muted-foreground">
          {showDate && <span className="w-32 sm:w-36">Date</span>}
          <span className="min-w-0 flex-1">Description</span>
          {!amountOnly && <span className="w-16 sm:w-20">{quantityLabel}</span>}
          <span className="w-24 sm:w-28">{amountOnly ? "Amount" : rateLabel}</span>
          <span className="w-7" />
        </div>
        {lineItems.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            {showDate && (
              <Input
                type="date"
                value={dateInputValue(item.lineDate)}
                onChange={(e) => updateLineItem(index, { lineDate: e.target.value || null })}
                className="w-32 sm:w-36"
                title="Date"
                aria-label="Date"
              />
            )}
            <Input
              placeholder="Description"
              value={item.description}
              onChange={(e) => updateLineItem(index, { description: e.target.value })}
              className="min-w-0 flex-1"
            />
            {amountOnly ? (
              <Input
                type="number"
                min={0}
                step="0.01"
                value={Math.round(item.quantity * item.unitPrice * 100) / 100}
                onChange={(e) => updateLineItem(index, { quantity: 1, unitPrice: Number(e.target.value) || 0 })}
                className="w-24 sm:w-28"
                title="Amount"
                aria-label="Amount"
              />
            ) : (
              <>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) || 1 })}
                  className="w-16 sm:w-20"
                  title={quantityLabel}
                  aria-label={quantityLabel}
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateLineItem(index, { unitPrice: Number(e.target.value) || 0 })}
                  className="w-24 sm:w-28"
                  title={rateLabel}
                  aria-label={rateLabel}
                />
              </>
            )}
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
