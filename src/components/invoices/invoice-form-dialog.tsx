"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createInvoice, updateInvoice } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

const NONE = "__none__";

type LineItem = { description: string; quantity: number; unitPrice: number };

type ClientOption = { id: string; name: string };
type ApplicationOption = { id: string; name: string; clientId: string };

type ExistingInvoice = {
  id: string;
  clientId: string;
  applicationId: string | null;
  dueDate: Date | null;
  notes: string | null;
  lineItems: LineItem[];
};

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

function emptyLineItem(): LineItem {
  return { description: "", quantity: 1, unitPrice: 0 };
}

export function InvoiceFormDialog({
  clients,
  applications,
  invoice,
  trigger,
}: {
  clients: ClientOption[];
  applications: ApplicationOption[];
  invoice?: ExistingInvoice;
  trigger?: React.ReactElement;
}) {
  const router = useRouter();
  const isEdit = !!invoice;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [clientId, setClientId] = useState(invoice?.clientId ?? clients[0]?.id ?? "");
  const [applicationId, setApplicationId] = useState(invoice?.applicationId ?? NONE);
  const [dueDate, setDueDate] = useState(toDateInputValue(invoice?.dueDate ?? null));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lineItems, setLineItems] = useState<LineItem[]>(
    invoice?.lineItems.length ? invoice.lineItems : [emptyLineItem()]
  );

  const clientApplications = applications.filter((a) => a.clientId === clientId);
  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);

  function updateLineItem(index: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLineItem() {
    setLineItems((items) => [...items, emptyLineItem()]);
  }

  function removeLineItem(index: number) {
    setLineItems((items) => (items.length > 1 ? items.filter((_, i) => i !== index) : items));
  }

  function handleSubmit() {
    if (!clientId) {
      toast.error("Pick a client");
      return;
    }
    const cleanItems = lineItems.filter((li) => li.description.trim().length > 0);
    if (cleanItems.length === 0) {
      toast.error("Add at least one line item");
      return;
    }

    const input = {
      clientId,
      applicationId: applicationId === NONE ? undefined : applicationId,
      dueDate: dueDate || undefined,
      notes: notes || undefined,
      lineItems: cleanItems,
    };

    startTransition(async () => {
      try {
        if (isEdit) {
          await updateInvoice(invoice.id, input);
          toast.success("Invoice updated");
        } else {
          await createInvoice(input);
          toast.success("Invoice created");
        }
        setOpen(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save invoice");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button data-tour="new-invoice">New Invoice</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Invoice" : "New Invoice"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Client</Label>
              <SearchableSelect
                items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                value={clientId || null}
                onValueChange={(v) => {
                  setClientId(v ?? clientId);
                  setApplicationId(NONE);
                }}
                searchPlaceholder="Search clients..."
              />
            </div>
            <div className="space-y-1">
              <Label>Case (optional)</Label>
              <SearchableSelect
                items={{ [NONE]: "None", ...Object.fromEntries(clientApplications.map((a) => [a.id, a.name])) }}
                value={applicationId}
                onValueChange={(v) => setApplicationId(v ?? NONE)}
                searchPlaceholder="Search cases..."
              />
            </div>
          </div>

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

          <div className="space-y-1">
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="max-w-40" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note printed on the invoice" />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Subtotal ${subtotal.toFixed(2)} — tax calculated automatically by Stripe Tax when sent</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={isPending}>
            {isPending ? "Saving..." : isEdit ? "Save changes" : "Create invoice"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
