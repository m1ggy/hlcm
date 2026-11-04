"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, MoreHorizontal, Paperclip, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { formatDuration, formatMoney } from "@/lib/time-entries";
import { PAYROLL_METHOD_LABELS, formatDay } from "@/lib/payroll";
import { undoPaid, resolvePaymentProblem, type PayrollRow, type PeriodSummary, type PayrollFile } from "@/lib/actions/payroll";
import { PayrollStatusBadge } from "@/components/payroll/payroll-status-badge";
import { PayrollFiles } from "@/components/payroll/payroll-files";
import { MarkPaidDialog, EditPaymentDialog, type MarkPaidPerson } from "@/components/payroll/payment-dialogs";

type Detail = {
  start: string;
  end: string;
  label: string;
  rows: PayrollRow[];
  olderPeriodFiles: PayrollFile[];
};

function periodBadge(p: PeriodSummary) {
  if (p.people === 0 && p.paid === 0) return "no time";
  if (p.problems > 0) return `${p.problems} problem${p.problems === 1 ? "" : "s"}`;
  if (p.paid === 0) return "not paid";
  if (p.paid < p.people) return `${p.paid} / ${p.people} paid`;
  if (p.awaiting > 0) return `paid · ${p.awaiting} unconfirmed`;
  return "paid · all confirmed";
}

// Live hours drifting from what was paid — only possible through a late
// clock-out, since admin edits are locked once someone's paid.
function hoursChanged(row: PayrollRow) {
  return row.payment != null && Math.abs(row.payment.hours - row.hours) > 0.01;
}

export function PayrollPeriodView({
  periods,
  detail,
  canManage,
}: {
  periods: PeriodSummary[];
  detail: Detail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [markPeople, setMarkPeople] = useState<MarkPaidPerson[] | null>(null);
  const [editing, setEditing] = useState<PayrollRow | null>(null);

  const unpaid = detail.rows.filter((r) => !r.payment && r.hours > 0);
  const paid = detail.rows.filter((r) => r.payment);
  const totalGross = paid.reduce((s, r) => s + r.payment!.grossAmount, 0);
  const totalNet = paid.reduce((s, r) => s + r.payment!.netAmount, 0);
  const unpaidGross = unpaid.reduce((s, r) => s + (r.gross ?? 0), 0);
  const noRate = unpaid.filter((r) => r.gross == null).length;

  const periodItems = Object.fromEntries(periods.map((p) => [p.start, `${p.label} — ${periodBadge(p)}`]));
  if (!periodItems[detail.start]) periodItems[detail.start] = detail.label;

  function toPerson(r: PayrollRow): MarkPaidPerson {
    return { userId: r.userId, userName: r.userName, hours: r.hours, hourlyRate: r.hourlyRate, gross: r.gross, onTheClock: r.onTheClock };
  }

  function run(id: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusyId(id);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) return void toast.error(result.error);
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Something went wrong — try again"));
      } finally {
        setBusyId(null);
      }
    });
  }

  function handleUndo(row: PayrollRow) {
    const p = row.payment!;
    const files = p.files.length > 0 ? ` Their ${p.files.length} file${p.files.length === 1 ? "" : "s"} for this period will be deleted too.` : "";
    if (!confirm(`Undo ${row.userName}'s payment for ${detail.label}? They go back to "Not paid" and their time unlocks.${files}`)) return;
    run(p.id, () => undoPaid(p.id), "Payment undone");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Pay period</p>
          <Select items={periodItems} value={detail.start} onValueChange={(v) => v && router.push(`/payroll?period=${v}`)}>
            <SelectTrigger className="w-full sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(periodItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && unpaid.length > 0 && (
          <Button className="sm:ml-auto" onClick={() => setMarkPeople(unpaid.map(toPerson))}>
            <Wallet className="size-4" /> Mark all paid ({unpaid.length})
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-lg font-semibold">
            {paid.length} of {paid.length + unpaid.length}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Sent (gross / net)</p>
          <p className="text-lg font-semibold">
            {formatMoney(totalGross)} <span className="text-sm font-normal text-muted-foreground">/ {formatMoney(totalNet)}</span>
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Still to pay (gross)</p>
          <p className="text-lg font-semibold">{formatMoney(unpaidGross)}</p>
          {noRate > 0 && (
            <p className="text-xs text-muted-foreground">
              + {noRate} {noRate === 1 ? "person" : "people"} with no hourly rate
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            Everyone with time in {detail.label}. Hours count the day a shift started. Once someone is marked paid, their time in this
            period is locked on the Time page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No time logged in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Gross</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.rows.map((row) => {
                    const p = row.payment;
                    const isOpen = expanded === row.userId;
                    return (
                      <Fragment key={row.userId}>
                        <TableRow>
                          <TableCell className="font-medium">
                            {row.userName}
                            {row.onTheClock && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(on the clock)</span>}
                          </TableCell>
                          <TableCell>
                            {formatDuration(p ? p.hours : row.hours)}
                            {hoursChanged(row) && (
                              <span
                                className="ml-1 inline-flex align-middle text-amber-600 dark:text-amber-400"
                                title={`Time changed after this was paid — now ${formatDuration(row.hours)}`}
                              >
                                <AlertTriangle className="size-3.5" />
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {(p ? p.hourlyRate : row.hourlyRate) != null ? `${formatMoney((p ? p.hourlyRate : row.hourlyRate)!)}/hr` : "—"}
                          </TableCell>
                          <TableCell>{p ? formatMoney(p.grossAmount) : row.gross != null ? formatMoney(row.gross) : "—"}</TableCell>
                          <TableCell>{p ? formatMoney(p.netAmount) : "—"}</TableCell>
                          <TableCell className="text-sm">
                            {p ? (
                              <>
                                {formatDay(p.paidOn)}
                                <span className="block text-xs text-muted-foreground">
                                  {PAYROLL_METHOD_LABELS[p.method]}
                                  {p.reference && ` · ${p.reference}`}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <PayrollStatusBadge payment={p} short />
                          </TableCell>
                          <TableCell>
                            {p ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => setExpanded(isOpen ? null : row.userId)}
                                aria-expanded={isOpen}
                                title="Show files"
                              >
                                {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                <Paperclip className="size-3.5" /> {p.files.length > 0 ? p.files.length : canManage ? "Add" : 0}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canManage && !p && row.hours > 0 && (
                              <Button size="xs" variant="outline" onClick={() => setMarkPeople([toPerson(row)])}>
                                Mark paid
                              </Button>
                            )}
                            {canManage && p && (
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      loading={isPending && busyId === p.id}
                                      aria-label={`Actions for ${row.userName}`}
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  }
                                />
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setEditing(row)}>Edit payment</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setExpanded(row.userId)}>Add files</DropdownMenuItem>
                                  {p.problemReportedAt && !p.problemResolvedAt && !p.acknowledgedAt && (
                                    <DropdownMenuItem onClick={() => run(p.id, () => resolvePaymentProblem(p.id), "Marked resolved — they've been asked to confirm")}>
                                      Mark problem resolved
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onClick={() => handleUndo(row)}>
                                    Undo paid
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                        {p?.problemReportedAt && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={9} className="pt-0">
                              <p
                                className={
                                  p.problemResolvedAt
                                    ? "rounded-md bg-muted p-2 text-xs whitespace-normal text-muted-foreground"
                                    : "rounded-md bg-destructive/10 p-2 text-xs whitespace-normal text-destructive"
                                }
                              >
                                <span className="font-medium">
                                  Problem reported {new Date(p.problemReportedAt).toLocaleDateString()}
                                  {p.problemResolvedAt && ` · resolved ${new Date(p.problemResolvedAt).toLocaleDateString()}`}:
                                </span>{" "}
                                {p.problemNote}
                              </p>
                            </TableCell>
                          </TableRow>
                        )}
                        {p && isOpen && (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={9} className="bg-muted/20 whitespace-normal">
                              <p className="mb-2 text-xs text-muted-foreground">
                                {row.userName}&apos;s files — they can see and download these. Paid by {p.markedBy}
                                {p.note && ` · ${p.note}`}
                              </p>
                              <PayrollFiles paymentId={p.id} files={p.files} canEdit={canManage} emptyText="No files for this person yet" compact />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {detail.olderPeriodFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Older period files</CardTitle>
            <CardDescription>
              Added for the whole period before files moved onto each person. Only payroll managers see these. Add new files to a
              person&apos;s row instead.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayrollFiles files={detail.olderPeriodFiles} canEdit={canManage} />
          </CardContent>
        </Card>
      )}

      {markPeople && (
        <MarkPaidDialog
          open
          onOpenChange={(open) => !open && setMarkPeople(null)}
          periodStart={detail.start}
          periodLabel={detail.label}
          people={markPeople}
        />
      )}
      {editing?.payment && (
        <EditPaymentDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          payment={{ ...editing.payment, userName: editing.userName }}
        />
      )}
    </div>
  );
}
