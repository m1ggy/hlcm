"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Download, FileText, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { formatDuration, formatMoney } from "@/lib/time-entries";
import { PAYROLL_METHOD_LABELS, formatDay, paymentStatus } from "@/lib/payroll";
import { acknowledgePayment, reportPaymentProblem, type MyPayment } from "@/lib/actions/payroll";
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";

const SHOW_FIRST = 4;

/** The signed-in person's payments, with "I received this" / "Report a problem". */
export function MyPayList({ payments }: { payments: MyPayment[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<MyPayment | null>(null);
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);

  if (payments.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No payments recorded yet.</p>;
  }

  function acknowledge(p: MyPayment) {
    setBusyId(p.id);
    startTransition(async () => {
      try {
        const result = await acknowledgePayment(p.id);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Thanks — marked as received");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save — try again"));
      } finally {
        setBusyId(null);
      }
    });
  }

  function submitProblem() {
    if (!reporting) return;
    if (!note.trim()) return void toast.error("Say what's wrong");
    const id = reporting.id;
    startTransition(async () => {
      try {
        const result = await reportPaymentProblem(id, note);
        if (!result.ok) return void toast.error(result.error);
        toast.success("Sent — the accountant has been notified");
        setReporting(null);
        setNote("");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't send — try again"));
      }
    });
  }

  const visible = showAll ? payments : payments.slice(0, SHOW_FIRST);

  return (
    <div className="space-y-3">
      {visible.map((p) => {
        const status = paymentStatus(p);
        const needsMe = status === "awaiting" || status === "resolved";
        return (
          <div key={p.id} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{p.label}</p>
              <PayrollStatusBadge payment={p} short />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Hours</dt>
                <dd>{formatDuration(p.hours)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Gross</dt>
                <dd>{formatMoney(p.grossAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Net (take-home)</dt>
                <dd className="font-medium">{formatMoney(p.netAmount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Paid</dt>
                <dd>
                  {formatDay(p.paidOn)}
                  <span className="block text-xs text-muted-foreground">
                    {PAYROLL_METHOD_LABELS[p.method]}
                    {p.reference && ` · ${p.reference}`}
                  </span>
                </dd>
              </div>
            </dl>
            {p.files.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {p.files.map((f) => (
                  <li key={f.id}>
                    <a
                      href={`/api/payroll-attachments/${f.id}`}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{f.fileName}</span>
                      <Download className="size-3 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {p.problemReportedAt && (
              <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                You reported: {p.problemNote}
                {status === "problem" && " — the accountant is looking into it."}
                {status === "resolved" && " — the accountant marked this resolved."}
              </p>
            )}
            {needsMe && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => acknowledge(p)} loading={isPending && busyId === p.id}>
                  <CheckCircle2 className="size-3.5" /> I received this
                </Button>
                <Button size="sm" variant="outline" onClick={() => setReporting(p)}>
                  <MessageSquareWarning className="size-3.5" /> Report a problem
                </Button>
              </div>
            )}
            {status === "received" && p.acknowledgedAt && (
              <p className="text-xs text-muted-foreground">You confirmed on {new Date(p.acknowledgedAt).toLocaleDateString()}.</p>
            )}
          </div>
        );
      })}
      {payments.length > SHOW_FIRST && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${payments.length}`}
        </Button>
      )}

      <Dialog
        open={reporting != null}
        onOpenChange={(open) => {
          if (!open) {
            setReporting(null);
            setNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report a problem</DialogTitle>
            <DialogDescription>
              {reporting?.label} · {reporting ? formatMoney(reporting.netAmount) : ""}. The accountant gets your note right away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="problemNote">What&apos;s wrong?</Label>
              <Textarea
                id="problemNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                placeholder="e.g. Nothing has arrived yet, or the amount is short by 2 hours"
              />
            </div>
            <Button onClick={submitProblem} loading={isPending} className="w-full">
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
