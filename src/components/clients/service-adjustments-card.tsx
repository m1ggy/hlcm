"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createServiceAdjustment, deleteServiceAdjustment } from "@/lib/actions/service-adjustments";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { formatMoney } from "@/lib/time-entries";
import { formatShortCalendarDate } from "@/lib/invoice-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Adjustment = {
  id: string;
  amount: number;
  reason: string;
  date: Date;
  createdBy: { name: string };
};

const KINDS = { CREDIT: "Credit (owed less)", CHARGE: "Charge (owed more)" } as const;

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AddAdjustmentDialog({ clientServiceId }: { clientServiceId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<keyof typeof KINDS>("CREDIT");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await createServiceAdjustment(clientServiceId, {
          kind,
          amount: String(formData.get("amount") ?? ""),
          reason: String(formData.get("reason") ?? ""),
          date: String(formData.get("date") ?? ""),
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Adjustment added");
        setOpen(false);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Failed to add adjustment"));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setKind("CREDIT");
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add adjustment
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add adjustment</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            A discount, write-off or extra charge that changes what&apos;s owed on this service without an invoice or
            payment.
          </p>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select items={KINDS} value={kind} onValueChange={(v) => setKind((v as keyof typeof KINDS) ?? kind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KINDS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="adjustment-amount">Amount</Label>
              <Input id="adjustment-amount" name="amount" type="number" min="0.01" step="0.01" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adjustment-date">Date</Label>
              <Input id="adjustment-date" name="date" type="date" defaultValue={todayInputValue()} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adjustment-reason">Reason</Label>
            <Input id="adjustment-reason" name="reason" required placeholder="e.g. Loyalty discount" />
          </div>
          <Button type="submit" className="w-full" loading={isPending}>
            Add adjustment
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveButton({ adjustment }: { adjustment: Adjustment }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      loading={isPending}
      aria-label="Remove adjustment"
      onClick={() => {
        if (!confirm(`Remove "${adjustment.reason}"?`)) return;
        startTransition(async () => {
          try {
            const result = await deleteServiceAdjustment(adjustment.id);
            if (!result.ok) toast.error(result.error);
          } catch (error) {
            toast.error(unexpectedErrorMessage(error, "Failed to remove adjustment"));
          }
        });
      }}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

/** Credits and charges on one service (PDF §5's "± Adjustments"). */
export function ServiceAdjustmentsCard({
  clientServiceId,
  adjustments,
}: {
  clientServiceId: string;
  adjustments: Adjustment[];
}) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">Adjustments ({adjustments.length})</h2>
          <AddAdjustmentDialog clientServiceId={clientServiceId} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>By</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No credits or charges.
                </TableCell>
              </TableRow>
            )}
            {adjustments.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="tabular-nums">{formatShortCalendarDate(a.date)}</TableCell>
                <TableCell>{a.reason}</TableCell>
                <TableCell className="text-muted-foreground">{a.createdBy.name}</TableCell>
                <TableCell
                  className={`text-right tabular-nums ${a.amount < 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                >
                  {a.amount < 0 ? `−${formatMoney(-a.amount)}` : `+${formatMoney(a.amount)}`}
                </TableCell>
                <TableCell>
                  <RemoveButton adjustment={a} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
