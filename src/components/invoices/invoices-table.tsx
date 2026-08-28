"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge, INVOICE_STATUS_LABELS, InvoiceStatusValue, isInvoiceOverdue } from "./invoice-status-badge";
import { displayInvoiceNumber } from "@/lib/invoice-format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InvoiceRow = {
  id: string;
  seq: number;
  stripeInvoiceNumber: string | null;
  status: string;
  total: number | null;
  dueDate: Date | null;
  client: { id: string; name: string; businessName: string | null };
  application: { id: string; name: string } | null;
};

const FILTER_KEY = "hclm:invoices-filter";
type Filter = "all" | InvoiceStatusValue;

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const id = setTimeout(() => {
      const saved = window.localStorage.getItem(FILTER_KEY);
      if (saved) setFilter(saved as Filter);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function changeFilter(next: Filter) {
    setFilter(next);
    window.localStorage.setItem(FILTER_KEY, next);
  }

  // "All" follows the same hide-by-default pattern as archived clients/
  // projects — a voided invoice is done, nothing left to act on, and
  // shouldn't clutter the main list. It's still one click away via its own
  // "Void" chip, same as archived items get their own explicit view.
  const filtered = invoices.filter((invoice) =>
    filter === "all" ? invoice.status !== "VOID" : invoice.status === filter
  );

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: invoices.filter((i) => i.status !== "VOID").length },
    ...(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatusValue[]).map((s) => ({
      key: s,
      label: INVOICE_STATUS_LABELS[s],
      count: invoices.filter((i) => i.status === s).length,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => changeFilter(chip.key)}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              filter === chip.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {chip.label}
            <span className="tabular-nums opacity-70">{chip.count}</span>
          </button>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Case</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((invoice) => (
            <TableRow key={invoice.id} className="cursor-pointer" onClick={() => router.push(`/invoices/${invoice.id}`)}>
              <TableCell className="font-medium tabular-nums">{displayInvoiceNumber(invoice)}</TableCell>
              <TableCell>{invoice.client.businessName ?? invoice.client.name}</TableCell>
              <TableCell className="text-muted-foreground">{invoice.application?.name ?? "—"}</TableCell>
              <TableCell><InvoiceStatusBadge status={isInvoiceOverdue(invoice) ? "OVERDUE" : invoice.status} /></TableCell>
              <TableCell className={isInvoiceOverdue(invoice) ? "text-destructive" : undefined}>
                {invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{invoice.total != null ? `$${invoice.total.toFixed(2)}` : "—"}</TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No invoices match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
