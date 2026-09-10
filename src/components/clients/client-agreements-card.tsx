"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { createClientAgreement, updateClientAgreement, deleteClientAgreement } from "@/lib/actions/client-agreements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

export type ClientAgreement = {
  id: string;
  agreementType: string;
  signedDate: Date | null;
  amount: number | null;
  paymentStatus: string | null;
  notes: string | null;
};

const PAYMENT_STATUSES = ["Unpaid", "Partial", "Paid"] as const;

const PAYMENT_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  Unpaid: "outline",
  Partial: "secondary",
  Paid: "default",
};

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

// paymentStatus is controlled (not a plain name= input) — matches this
// codebase's own convention for Select inside a form (see
// mco-credentials-card.tsx): the value is injected into the FormData by
// the caller's onSubmit rather than relying on native form submission.
function AgreementFields({
  defaultValues,
  paymentStatus,
  onPaymentStatusChange,
}: {
  defaultValues?: ClientAgreement;
  paymentStatus: string;
  onPaymentStatusChange: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="client-agreement-type">Agreement type</Label>
        <Input
          id="client-agreement-type"
          name="agreementType"
          placeholder="e.g. Service Agreement"
          defaultValue={defaultValues?.agreementType}
          required
        />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="client-agreement-signed">Signed date</Label>
          <Input id="client-agreement-signed" name="signedDate" type="date" defaultValue={toDateInputValue(defaultValues?.signedDate ?? null)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-agreement-amount">Amount</Label>
          <Input id="client-agreement-amount" name="amount" type="number" min={0} step="0.01" defaultValue={defaultValues?.amount ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-agreement-payment-status">Payment status</Label>
          <Select items={Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, s]))} value={paymentStatus || null} onValueChange={(v) => onPaymentStatusChange(v ?? "")}>
            <SelectTrigger id="client-agreement-payment-status" className="w-full">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="client-agreement-notes">Notes</Label>
        <Textarea id="client-agreement-notes" name="notes" rows={2} defaultValue={defaultValues?.notes ?? ""} />
      </div>
    </>
  );
}

function NewAgreementDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [paymentStatus, setPaymentStatus] = useState("");

  function handleSubmit(formData: FormData) {
    formData.set("clientId", clientId);
    formData.set("paymentStatus", paymentStatus);
    startTransition(async () => {
      try {
        await createClientAgreement(formData);
        toast.success("Agreement added");
        setOpen(false);
        setPaymentStatus("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to add agreement");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm">Add agreement</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add agreement</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <AgreementFields paymentStatus={paymentStatus} onPaymentStatusChange={setPaymentStatus} />
          <Button type="submit" className="w-full" loading={isPending}>
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditAgreementDialog({ agreement }: { agreement: ClientAgreement }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [paymentStatus, setPaymentStatus] = useState(agreement.paymentStatus ?? "");

  function handleSubmit(formData: FormData) {
    formData.set("paymentStatus", paymentStatus);
    startTransition(async () => {
      try {
        await updateClientAgreement(agreement.id, formData);
        toast.success("Agreement updated");
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update agreement");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="size-7"><Pencil className="size-3.5" /></Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit agreement</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <AgreementFields defaultValues={agreement} paymentStatus={paymentStatus} onPaymentStatusChange={setPaymentStatus} />
          <Button type="submit" className="w-full" loading={isPending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAgreementButton({ agreement }: { agreement: ClientAgreement }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Remove the "${agreement.agreementType}" agreement?`)) return;
    startTransition(async () => {
      try {
        await deleteClientAgreement(agreement.id);
        toast.success("Agreement removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to remove agreement");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDelete} loading={isPending}>
      Remove
    </Button>
  );
}

function AgreementRow({ agreement }: { agreement: ClientAgreement }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{agreement.agreementType}</span>
          {agreement.paymentStatus && (
            <Badge variant={PAYMENT_STATUS_VARIANT[agreement.paymentStatus] ?? "outline"}>{agreement.paymentStatus}</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <EditAgreementDialog agreement={agreement} />
          <DeleteAgreementButton agreement={agreement} />
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
        {agreement.signedDate && <span>Signed {new Date(agreement.signedDate).toLocaleDateString()}</span>}
        {agreement.amount != null && <span className="tabular-nums">${agreement.amount.toFixed(2)}</span>}
      </div>
      {agreement.notes && <p className="mt-2 text-sm text-muted-foreground">{agreement.notes}</p>}
    </div>
  );
}

// Newest-first history (see listClientAgreements) — the most recent
// agreement is pulled out and shown as the "at a glance" summary the ask
// calls for, with the rest available below.
export function ClientAgreementsCard({ clientId, agreements }: { clientId: string; agreements: ClientAgreement[] }) {
  const [current, ...rest] = agreements;

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-medium">Agreements</h2>
          <NewAgreementDialog clientId={clientId} />
        </div>
        {agreements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agreements on file yet.</p>
        ) : (
          <div className="space-y-2">
            <AgreementRow agreement={current} />
            {rest.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground select-none">
                  {rest.length} earlier agreement{rest.length === 1 ? "" : "s"}
                </summary>
                <div className="mt-2 space-y-2">
                  {rest.map((a) => (
                    <AgreementRow key={a.id} agreement={a} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
