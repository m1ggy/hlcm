"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { InvoiceLineItemsEditor, emptyLineItem, type LineItem } from "./invoice-line-items-editor";

const NONE = "__none__";

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

          <InvoiceLineItemsEditor lineItems={lineItems} onChange={setLineItems} />

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
