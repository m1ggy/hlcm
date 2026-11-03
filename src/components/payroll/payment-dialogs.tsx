"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { formatDuration, formatMoney, toDateInputValue } from "@/lib/time-entries";
import { PAYROLL_METHODS, PAYROLL_METHOD_LABELS, PAYROLL_TIMEZONE, type PayrollMethodValue } from "@/lib/payroll";
import { markPaid, updatePayment } from "@/lib/actions/payroll";
import { uploadPayrollAttachment } from "@/lib/actions/payroll-attachments";

type Details = { paidOn: string; method: PayrollMethodValue; reference: string; note: string };

function today() {
  return toDateInputValue(new Date(), PAYROLL_TIMEZONE);
}

/** Paid date, method, reference and note — shared by both dialogs. */
function DetailFields({ value, onChange }: { value: Details; onChange: (next: Details) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="paidOn">Paid on</Label>
          <Input id="paidOn" type="date" value={value.paidOn} onChange={(e) => onChange({ ...value, paidOn: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Method</Label>
          <Select
            items={PAYROLL_METHOD_LABELS}
            value={value.method}
            onValueChange={(v) => onChange({ ...value, method: (v ?? value.method) as PayrollMethodValue })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYROLL_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {PAYROLL_METHOD_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="payRef">Reference (optional)</Label>
        <Input
          id="payRef"
          value={value.reference}
          onChange={(e) => onChange({ ...value, reference: e.target.value })}
          placeholder="Check number, bank or batch reference"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="payNote">Note (optional)</Label>
        <Textarea id="payNote" value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} rows={2} />
      </div>
    </div>
  );
}

export type MarkPaidPerson = {
  userId: string;
  userName: string;
  hours: number;
  hourlyRate: number | null;
  gross: number | null;
  onTheClock: boolean;
};

function money(n: number | null) {
  return n == null ? "" : n.toFixed(2);
}

/**
 * Marks one person ("Mark paid") or everyone unpaid ("Mark all paid") as
 * paid. Gross starts as hours × rate and can be changed; net starts as
 * gross and is what the accountant actually sent. Saving locks their time
 * in the period.
 */
export function MarkPaidDialog({
  open,
  onOpenChange,
  periodStart,
  periodLabel,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodStart: string;
  periodLabel: string;
  people: MarkPaidPerson[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // The parent mounts this only while open, so state starts fresh from the
  // latest numbers every time.
  const [details, setDetails] = useState<Details>(() => ({ paidOn: today(), method: "DIRECT_DEPOSIT", reference: "", note: "" }));
  const [amounts, setAmounts] = useState<Record<string, { gross: string; net: string; include: boolean }>>(() =>
    Object.fromEntries(people.map((p) => [p.userId, { gross: money(p.gross), net: money(p.gross), include: true }]))
  );

  function setAmount(userId: string, patch: Partial<{ gross: string; net: string; include: boolean }>) {
    setAmounts((prev) => {
      const current = prev[userId];
      const next = { ...current, ...patch };
      // Net follows gross until someone types a different net.
      if (patch.gross !== undefined && current.net === current.gross) next.net = patch.gross;
      return { ...prev, [userId]: next };
    });
  }

  // Files picked per person, uploaded onto their payment once it's saved.
  const [files, setFiles] = useState<Record<string, File[]>>({});

  const included = people.filter((p) => amounts[p.userId]?.include);
  const single = people.length === 1;

  function handleSubmit() {
    if (!details.paidOn) return void toast.error("Pick the date it was paid");
    const payload: { userId: string; grossAmount: number; netAmount: number }[] = [];
    for (const p of included) {
      const a = amounts[p.userId];
      if (a.gross.trim() === "") return void toast.error(`Enter a gross amount for ${p.userName}`);
      if (a.net.trim() === "") return void toast.error(`Enter a net amount for ${p.userName}`);
      const gross = Number(a.gross);
      const net = Number(a.net);
      if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(net) || net < 0) {
        return void toast.error(`Check the amounts for ${p.userName}`);
      }
      payload.push({ userId: p.userId, grossAmount: gross, netAmount: net });
    }
    if (payload.length === 0) return void toast.error("Choose at least one person");

    startTransition(async () => {
      try {
        const result = await markPaid({
          start: periodStart,
          paidOn: details.paidOn,
          method: details.method,
          reference: details.reference || undefined,
          note: details.note || undefined,
          people: payload,
        });
        if (!result.ok) return void toast.error(result.error);
        const failed: string[] = [];
        for (const p of included) {
          const paymentId = result.data.ids[p.userId];
          for (const file of files[p.userId] ?? []) {
            const form = new FormData();
            form.set("file", file);
            try {
              const upload = paymentId ? await uploadPayrollAttachment(paymentId, form) : { ok: false as const, error: "" };
              if (!upload.ok) failed.push(`${file.name} (${p.userName})${upload.error ? `: ${upload.error}` : ""}`);
            } catch {
              // The payment is saved either way — only this file is missing.
              failed.push(`${file.name} (${p.userName})`);
            }
          }
        }
        toast.success(result.data.count === 1 ? "Marked paid" : `${result.data.count} people marked paid`);
        if (failed.length > 0) {
          toast.error("Some files didn't upload — add them from the person's row", { description: failed.join("; ") });
        }
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't mark paid — try again"));
      }
    });
  }

  const onClock = included.filter((p) => p.onTheClock);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={single ? "sm:max-w-md" : "sm:max-w-2xl"}>
        <DialogHeader>
          <DialogTitle>{single ? `Mark ${people[0]?.userName} paid` : "Mark all paid"}</DialogTitle>
          <DialogDescription>
            {periodLabel}. Their time in this period is locked once saved — use Undo paid to change it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {!single && (
              <div className="hidden grid-cols-[1fr_7rem_7rem] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
                <span>Person</span>
                <span>Gross</span>
                <span>Net</span>
              </div>
            )}
            {people.map((p) => {
              const a = amounts[p.userId];
              if (!a) return null;
              return (
                <div key={p.userId} className="grid items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_7rem_7rem]">
                  <label className="flex min-w-0 items-start gap-2 text-sm">
                    {!single && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={a.include}
                        onChange={(e) => setAmount(p.userId, { include: e.target.checked })}
                        aria-label={`Include ${p.userName}`}
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.userName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDuration(p.hours)} × {p.hourlyRate != null ? `${formatMoney(p.hourlyRate)}/hr` : "no rate set"}
                      </span>
                    </span>
                  </label>
                  <div className="space-y-0.5">
                    <Label htmlFor={`gross-${p.userId}`} className="text-xs sm:sr-only">
                      Gross
                    </Label>
                    <Input
                      id={`gross-${p.userId}`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={a.gross}
                      disabled={!a.include}
                      onChange={(e) => setAmount(p.userId, { gross: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label htmlFor={`net-${p.userId}`} className="text-xs sm:sr-only">
                      Net (take-home)
                    </Label>
                    <Input
                      id={`net-${p.userId}`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={a.net}
                      disabled={!a.include}
                      onChange={(e) => setAmount(p.userId, { net: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-0.5 sm:col-span-3">
                    <Label htmlFor={`files-${p.userId}`} className="text-xs text-muted-foreground">
                      Files for {p.userName} (optional — pay stub, deposit slip; only they and payroll managers see them)
                    </Label>
                    <input
                      id={`files-${p.userId}`}
                      type="file"
                      multiple
                      disabled={!a.include}
                      accept="image/*,.pdf,.csv,.xlsx,.docx"
                      onChange={(e) => setFiles((prev) => ({ ...prev, [p.userId]: Array.from(e.target.files ?? []) }))}
                      className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent text-sm file:mr-2 file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {single && <p className="-mt-2 text-xs text-muted-foreground">Gross is hours × rate. Net is the take-home amount actually sent.</p>}
          {onClock.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {onClock.map((p) => p.userName).join(", ")} {onClock.length === 1 ? "is" : "are"} still on the clock — that shift
              isn&apos;t counted.
            </p>
          )}
          <DetailFields value={details} onChange={setDetails} />
          <Button onClick={handleSubmit} loading={isPending} className="w-full">
            {single ? "Mark paid" : `Mark ${included.length} paid`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type EditablePayment = {
  id: string;
  userName: string;
  grossAmount: number;
  netAmount: number;
  method: PayrollMethodValue;
  reference: string | null;
  note: string | null;
  paidOn: string;
};

/** Fixes a payment's amounts and details. Hours stay as snapshotted. */
export function EditPaymentDialog({
  open,
  onOpenChange,
  payment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: EditablePayment;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Mounted only while open (see MarkPaidDialog).
  const [details, setDetails] = useState<Details>(() => ({
    paidOn: payment.paidOn,
    method: payment.method,
    reference: payment.reference ?? "",
    note: payment.note ?? "",
  }));
  const [gross, setGross] = useState(() => payment.grossAmount.toFixed(2));
  const [net, setNet] = useState(() => payment.netAmount.toFixed(2));

  function handleSubmit() {
    const g = Number(gross);
    const n = Number(net);
    if (gross.trim() === "" || net.trim() === "" || !Number.isFinite(g) || !Number.isFinite(n) || g < 0 || n < 0) {
      return void toast.error("Check the amounts");
    }
    startTransition(async () => {
      try {
        const result = await updatePayment(payment.id, {
          grossAmount: g,
          netAmount: n,
          paidOn: details.paidOn,
          method: details.method,
          reference: details.reference || undefined,
          note: details.note || undefined,
        });
        if (!result.ok) return void toast.error(result.error);
        toast.success("Payment updated");
        onOpenChange(false);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save — try again"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit payment — {payment.userName}</DialogTitle>
          <DialogDescription>Hours stay as they were when paid. To re-count hours, undo the payment and mark it again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="editGross">Gross</Label>
              <Input id="editGross" type="number" min={0} step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="editNet">Net (take-home)</Label>
              <Input id="editNet" type="number" min={0} step="0.01" value={net} onChange={(e) => setNet(e.target.value)} />
            </div>
          </div>
          <DetailFields value={details} onChange={setDetails} />
          <Button onClick={handleSubmit} loading={isPending} className="w-full">
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
