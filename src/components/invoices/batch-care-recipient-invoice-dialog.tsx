"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { listUnbilledVisitsForClient } from "@/lib/actions/care-recipients";
import { createBatchCareRecipientInvoices, type BatchInvoiceResult } from "@/lib/actions/care-recipient-invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";

type ClientOption = { id: string; name: string };
type ProfileOption = { id: string; name: string };

type PreviewRecipient = {
  id: string;
  name: string;
  hourlyRate: number | null;
  visits: { id: string; clockIn: Date; clockOut: Date | null }[];
};

function hoursOf(v: { clockIn: Date; clockOut: Date | null }) {
  return ((v.clockOut ?? v.clockIn).getTime() - v.clockIn.getTime()) / (1000 * 60 * 60);
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Step = "setup" | "review" | "results";

/**
 * "This week's Ace invoices" — bills every picked recipient under one
 * Client from their logged unbilled hourly visits in a date range, instead
 * of the one-at-a-time flow in NewCareRecipientInvoiceDialog. Day-rate/
 * live-in billing isn't included here — those ranges/rates are more often
 * recipient-specific and worth a human glance, so they stay on the
 * one-at-a-time form. Always controlled — see NewInvoiceMenu.
 */
export function BatchCareRecipientInvoiceDialog({
  open,
  onOpenChange,
  clients,
  profiles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("setup");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [clientId, setClientId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [issueDate, setIssueDate] = useState(todayInputValue());
  const [dueDate, setDueDate] = useState("");

  const [preview, setPreview] = useState<PreviewRecipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<BatchInvoiceResult[]>([]);

  function reset() {
    setStep("setup");
    setClientId(null);
    setFrom("");
    setTo("");
    setProfileId(profiles[0]?.id ?? "");
    setIssueDate(todayInputValue());
    setDueDate("");
    setPreview([]);
    setSelected(new Set());
    setResults([]);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  function handlePreview() {
    if (!clientId || !from || !to) {
      toast.error("Pick a client and a date range");
      return;
    }
    setIsLoading(true);
    listUnbilledVisitsForClient(clientId, from, to)
      .then((rows) => {
        setPreview(rows);
        setSelected(new Set(rows.map((r) => r.id)));
        setStep("review");
        if (rows.length === 0) toast.error("No unbilled visits for this client in that range");
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load unbilled visits"))
      .finally(() => setIsLoading(false));
  }

  function toggle(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  function handleCreate() {
    if (!clientId || selected.size === 0) {
      toast.error("Select at least one recipient");
      return;
    }
    setIsSubmitting(true);
    createBatchCareRecipientInvoices({
      clientId,
      recipientIds: Array.from(selected),
      from,
      to,
      invoiceProfileId: profileId || undefined,
      issueDate: issueDate || undefined,
      dueDate: dueDate || undefined,
    })
      .then((rows) => {
        setResults(rows);
        setStep("results");
        router.refresh();
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to create invoices"))
      .finally(() => setIsSubmitting(false));
  }

  const selectedTotal = preview
    .filter((r) => selected.has(r.id))
    .reduce((sum, r) => sum + r.visits.reduce((s, v) => s + hoursOf(v), 0) * (r.hourlyRate ?? 0), 0);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch invoice by client</DialogTitle>
        </DialogHeader>

        {step === "setup" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Bills every recipient under one client from their logged, unbilled hourly visits in the date range
              below — one invoice per recipient. Live-in/day-rate billing isn&apos;t included; bill those
              individually from the Care Recipient option instead.
            </p>

            <div className="space-y-1">
              <Label>Client</Label>
              <SearchableSelect
                items={Object.fromEntries(clients.map((c) => [c.id, c.name]))}
                value={clientId}
                onValueChange={setClientId}
                searchPlaceholder="Search clients..."
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="batchFrom">From</Label>
                <Input id="batchFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="batchTo">To</Label>
                <Input id="batchTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            {profiles.length > 1 && (
              <div className="space-y-1">
                <Label>Bill as</Label>
                <SearchableSelect
                  items={Object.fromEntries(profiles.map((p) => [p.id, p.name]))}
                  value={profileId || null}
                  onValueChange={(v) => setProfileId(v ?? profileId)}
                  searchPlaceholder="Search profiles..."
                />
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="batchIssueDate">Issue date</Label>
                <Input id="batchIssueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="batchDueDate">Due date (optional)</Label>
                <Input id="batchDueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            <Button onClick={handlePreview} className="w-full" loading={isLoading}>
              {isLoading ? "Loading..." : "Preview"}
            </Button>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            {preview.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unbilled visits for this client in that range.</p>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 border-b pb-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={selected.size === preview.length}
                    onCheckedChange={(c) => setSelected(c === true ? new Set(preview.map((r) => r.id)) : new Set())}
                  />
                  <span>Select all ({preview.length})</span>
                </div>
                {preview.map((r) => {
                  const hours = r.visits.reduce((s, v) => s + hoursOf(v), 0);
                  const amount = hours * (r.hourlyRate ?? 0);
                  return (
                    <label key={r.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={(c) => toggle(r.id, c === true)} />
                        {r.name}
                        <span className="text-xs text-muted-foreground">
                          {r.visits.length} visit{r.visits.length === 1 ? "" : "s"} · {hours.toFixed(2)}h
                        </span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">${amount.toFixed(2)}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{selected.size} selected</span>
              <span className="font-medium">${selectedTotal.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("setup")} className="flex-1">
                Back
              </Button>
              <Button onClick={handleCreate} className="flex-1" loading={isSubmitting} disabled={selected.size === 0}>
                {isSubmitting ? "Creating..." : `Create ${selected.size} invoice${selected.size === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              {results.map((r) => (
                <div key={r.recipientId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    {r.status === "created" && <CheckCircle2 className="size-3.5 text-emerald-600" />}
                    {r.status === "skipped" && <MinusCircle className="size-3.5 text-muted-foreground" />}
                    {r.status === "failed" && <XCircle className="size-3.5 text-destructive" />}
                    {r.recipientName}
                  </span>
                  {r.status === "created" && (
                    <Link href={`/invoices/${r.invoiceId}`} className="text-xs text-primary hover:underline">
                      View invoice
                    </Link>
                  )}
                  {r.status === "skipped" && <span className="text-xs text-muted-foreground">Already billed elsewhere</span>}
                  {r.status === "failed" && <span className="text-xs text-destructive">{r.error}</span>}
                </div>
              ))}
            </div>
            <Button onClick={close} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
