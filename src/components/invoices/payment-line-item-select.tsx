"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatMoney } from "@/lib/money";

/** `due` (what's still owed on the line, see lineBalances) is shown next to its name when given. */
export type PaymentLineItemOption = { id: string; description: string; due?: number };

const optionLabel = (li: PaymentLineItemOption) => (li.due === undefined ? li.description : `${li.description} — ${formatMoney(li.due)} due`);

const WHOLE_INVOICE = "__whole_invoice__";

/**
 * Optional "Applies to" picker for a manual invoice's payment — one of the
 * invoice's own line items, or the invoice as a whole (value ""). See
 * Payment.lineItemId in prisma/schema.prisma. Shared by
 * AddManualPaymentDialog and EditPaymentDialog.
 */
export function PaymentLineItemSelect({
  lineItems,
  value,
  onChange,
}: {
  lineItems: PaymentLineItemOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const items = {
    [WHOLE_INVOICE]: "Whole invoice",
    ...Object.fromEntries(lineItems.map((li) => [li.id, optionLabel(li)])),
  };

  return (
    <div className="space-y-1">
      <Label>
        Applies to <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Select items={items} value={value || WHOLE_INVOICE} onValueChange={(v) => onChange(!v || v === WHOLE_INVOICE ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={WHOLE_INVOICE}>Whole invoice</SelectItem>
          {lineItems.map((li) => (
            <SelectItem key={li.id} value={li.id}>
              {optionLabel(li)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
