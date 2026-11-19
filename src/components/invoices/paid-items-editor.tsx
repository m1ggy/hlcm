"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Plus, Trash2 } from "lucide-react";
import { addPaidLineItem } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PaymentMethodSelect } from "./payment-method-select";

// Items already paid when they're added — a downpayment, a retainer received
// up front. Each becomes a line on the invoice plus a payment for its full
// amount, so it shows on the list and in the totals without changing what's
// still owed. See addPaidLineItem / createManualInvoice.

export type PaidItem = { description: string; amount: string; paidAt: string; paymentMethod: string; reference?: string };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyPaidItem(): PaidItem {
  return { description: "", amount: "", paidAt: today(), paymentMethod: "" };
}

/** What's missing, or null when the item is ready to save. */
export function paidItemProblem(item: PaidItem): string | null {
  if (!item.description.trim()) return "Describe the paid item";
  if (!(Number(item.amount) > 0)) return "Enter the amount paid";
  if (!item.paidAt) return "Pick the date it was paid";
  if (!item.paymentMethod.trim()) return "Pick how it was paid";
  return null;
}

export const paidItemInput = (item: PaidItem) => ({
  description: item.description.trim(),
  amount: Number(item.amount),
  paidAt: item.paidAt,
  paymentMethod: item.paymentMethod.trim(),
  reference: item.reference?.trim() || undefined,
});

function PaidItemFields({ item, onChange, idPrefix }: { item: PaidItem; onChange: (next: PaidItem) => void; idPrefix: string }) {
  const set = (patch: Partial<PaidItem>) => onChange({ ...item, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-description`}>Description</Label>
          <Input id={`${idPrefix}-description`} value={item.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. Downpayment" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-amount`}>Amount paid</Label>
          <Input id={`${idPrefix}-amount`} type="number" min={0} step="0.01" value={item.amount} onChange={(e) => set({ amount: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-paidAt`}>Date paid</Label>
          <Input id={`${idPrefix}-paidAt`} type="date" value={item.paidAt} onChange={(e) => set({ paidAt: e.target.value })} />
        </div>
        <PaymentMethodSelect value={item.paymentMethod} onChange={(paymentMethod) => set({ paymentMethod })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-reference`}>Reference (optional)</Label>
        <Input
          id={`${idPrefix}-reference`}
          value={item.reference ?? ""}
          onChange={(e) => set({ reference: e.target.value })}
          placeholder="Check #, Zelle confirmation…"
        />
      </div>
    </div>
  );
}

/** The New invoice dialog's list of paid items. */
export function PaidItemsEditor({ items, onChange }: { items: PaidItem[]; onChange: (next: PaidItem[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>Already paid</Label>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">A downpayment or anything else the client has already paid — it goes on the invoice as paid.</p>
      )}
      {items.map((item, index) => (
        <div key={index} className="relative rounded-lg border p-3 pr-10">
          <PaidItemFields idPrefix={`paid-${index}`} item={item} onChange={(next) => onChange(items.map((it, i) => (i === index ? next : it)))} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-2 right-2"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            title="Remove paid item"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, emptyPaidItem()])}>
        <Plus className="size-3.5" /> Add paid item
      </Button>
    </div>
  );
}

/** "Add paid item" on an existing manual invoice. */
export function AddPaidItemDialog({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState(emptyPaidItem);
  const [isPending, startTransition] = useTransition();

  function save() {
    const problem = paidItemProblem(item);
    if (problem) return void toast.error(problem);
    startTransition(async () => {
      const result = await addPaidLineItem(invoiceId, paidItemInput(item));
      if (!result.ok) return void toast.error(result.error);
      toast.success("Paid item added");
      setOpen(false);
      setItem(emptyPaidItem());
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline"><BadgeCheck className="size-3.5" /> Add paid item</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add paid item</DialogTitle>
          <DialogDescription>
            A downpayment or anything else already paid. It&apos;s added to the invoice with its payment and a receipt, so
            the balance owed doesn&apos;t change.
          </DialogDescription>
        </DialogHeader>
        <PaidItemFields idPrefix="add-paid" item={item} onChange={setItem} />
        <Button onClick={save} className="w-full" loading={isPending}>
          {isPending ? "Adding..." : "Add paid item"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
