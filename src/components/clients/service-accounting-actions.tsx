"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, FileText, Globe, Plus } from "lucide-react";
import { addManualPayment } from "@/lib/actions/invoices";
import { formatMoney } from "@/lib/time-entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InvoiceFormDialog } from "@/components/invoices/invoice-form-dialog";
import { RecordPaymentDialog } from "@/components/invoices/record-payment-dialog";
import { PaymentMethodSelect } from "@/components/invoices/payment-method-select";

type PayableInvoice = { id: string; number: string; remaining: number };

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "+ Add Payment" from the Service Accounting mockup: pick which of the
// service's unpaid manual invoices it's for, then the same fields (and the
// same addManualPayment, receipt and all) as the invoice page's own
// "Record payment".
function AddPaymentDialog({
  invoices,
  open,
  onOpenChange,
}: {
  invoices: PayableInvoice[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? "");
  const [amount, setAmount] = useState(invoices[0]?.remaining.toFixed(2) ?? "");
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("");

  function pick(id: string) {
    setInvoiceId(id);
    setAmount(invoices.find((i) => i.id === id)?.remaining.toFixed(2) ?? "");
  }

  function handleSubmit() {
    const value = Number(amount);
    if (!invoiceId) return toast.error("Pick an invoice");
    if (!(value > 0)) return toast.error("Amount must be greater than 0");
    if (!paymentMethod.trim()) return toast.error("Pick or describe the payment method");
    startTransition(async () => {
      try {
        await addManualPayment(invoiceId, { amount: value, paidAt, paymentMethod: paymentMethod.trim(), lineItemId: null });
        toast.success("Payment recorded");
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to record payment");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add payment</DialogTitle>
        </DialogHeader>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No unpaid manual invoices on this service. Online (Stripe) invoices are marked paid automatically when the
            client pays.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Invoice</Label>
              <Select
                items={Object.fromEntries(invoices.map((i) => [i.id, `${i.number} — ${formatMoney(i.remaining)} owed`]))}
                value={invoiceId}
                onValueChange={(v) => pick(v ?? invoiceId)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.number} — {formatMoney(i.remaining)} owed
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="svc-pay-amount">Amount received</Label>
              <Input id="svc-pay-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="svc-pay-date">Payment date</Label>
              <Input id="svc-pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
            <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />
            <Button onClick={handleSubmit} className="w-full" loading={isPending}>
              Record payment
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "+ Add Invoice" (online or manual, pre-filed under the service) and "+ Add Payment". */
export function ServiceAccountingActions({
  client,
  service,
  profiles,
  payableInvoices,
}: {
  client: { id: string; name: string };
  service: { id: string; name: string };
  profiles: { id: string; name: string }[];
  payableInvoices: PayableInvoice[];
}) {
  const [active, setActive] = useState<"online" | "manual" | "payment" | null>(null);
  const services = [{ id: service.id, name: service.name, clientId: client.id }];
  const setOpen = (kind: typeof active) => (next: boolean) => setActive(next ? kind : null);

  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button>
              <Plus className="size-4" /> Add Invoice <ChevronDown className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setActive("manual")}>
            <FileText className="size-3.5" /> Manual
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setActive("online")}>
            <Globe className="size-3.5" /> Online (Stripe)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button onClick={() => setActive("payment")}>
        <Plus className="size-4" /> Add Payment
      </Button>

      <InvoiceFormDialog
        clients={[client]}
        applications={[]}
        services={services}
        defaultClientId={client.id}
        defaultServiceId={service.id}
        open={active === "online"}
        onOpenChange={setOpen("online")}
      />
      <RecordPaymentDialog
        clients={[client]}
        applications={[]}
        profiles={profiles}
        services={services}
        defaultClientId={client.id}
        defaultServiceId={service.id}
        open={active === "manual"}
        onOpenChange={setOpen("manual")}
      />
      {active === "payment" && <AddPaymentDialog invoices={payableInvoices} open onOpenChange={setOpen("payment")} />}
    </div>
  );
}
