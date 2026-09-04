"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge, INVOICE_STATUS_LABELS, InvoiceStatusValue, isInvoiceOverdue, isManualInvoice } from "./invoice-status-badge";
import { displayInvoiceNumber } from "@/lib/invoice-format";
import { Badge } from "@/components/ui/badge";
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
  stripeInvoiceId: string | null;
  stripeInvoiceNumber: string | null;
  invoiceNumber: string | null;
  status: string;
  total: number | null;
  amountPaid: number | null;
  dueDate: Date | null;
  editedAfterSendAt: Date | null;
  importedAt: Date | null;
  client: {
    id: string;
    name: string;
    businessName: string | null;
    clientGroupId: string | null;
    clientGroup: { id: string; name: string } | null;
    projects: { id: string; name: string }[];
  };
};

const FILTER_KEY = "hclm:invoices-filter";
const GROUP_KEY = "hclm:invoices-group-by-client";
type Filter = "all" | InvoiceStatusValue;

function clientLabel(client: InvoiceRow["client"]) {
  return client.businessName ?? client.name;
}

// A client is occasionally in more than one Project (see the comment on
// Client.projects in prisma/schema.prisma) — joined rather than picking
// just one, so this column never silently drops one.
function projectLabel(client: InvoiceRow["client"]) {
  return client.projects.length > 0 ? client.projects.map((p) => p.name).join(", ") : "—";
}

// Only SENT/PARTIALLY_PAID invoices actually have money still owed — a
// Draft was never billed, and Paid/Void (including one voided via
// voidInvoiceWithPayments, which resets amountPaid to 0 but not total)
// never owe anything regardless of what total minus amountPaid would
// otherwise compute to.
function outstandingBalance(invoice: Pick<InvoiceRow, "status" | "total" | "amountPaid">): number {
  if (invoice.status !== "SENT" && invoice.status !== "PARTIALLY_PAID") return 0;
  return Math.max(0, (invoice.total ?? 0) - (invoice.amountPaid ?? 0));
}

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  // Grouped by client is the default — a flat "All" list (today's original
  // view, still newest-first) stays one click away for anyone who prefers it.
  const [groupByClient, setGroupByClient] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      const savedFilter = window.localStorage.getItem(FILTER_KEY);
      if (savedFilter) setFilter(savedFilter as Filter);
      const savedGroup = window.localStorage.getItem(GROUP_KEY);
      if (savedGroup) setGroupByClient(savedGroup === "true");
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function changeFilter(next: Filter) {
    setFilter(next);
    window.localStorage.setItem(FILTER_KEY, next);
  }

  function changeGrouping(next: boolean) {
    setGroupByClient(next);
    window.localStorage.setItem(GROUP_KEY, String(next));
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

  // Invoices already arrive newest-first (see listInvoices); grouping just
  // buckets that same order, it doesn't re-sort within a bucket. Bucketed
  // by ClientGroup when the client belongs to one (see Client.clientGroup
  // in prisma/schema.prisma — a client group merges several clients into
  // one section, e.g. a holding company's separate locations), falling
  // back to the individual client otherwise — same as before this existed.
  const groups = groupByClient
    ? Object.values(
        filtered.reduce<Record<string, { key: string; label: string; rows: InvoiceRow[] }>>((acc, invoice) => {
          const key = invoice.client.clientGroupId ?? invoice.client.id;
          const label = invoice.client.clientGroup?.name ?? clientLabel(invoice.client);
          const bucket = acc[key] ?? { key, label, rows: [] };
          bucket.rows.push(invoice);
          acc[key] = bucket;
          return acc;
        }, {})
      ).sort((a, b) => a.label.localeCompare(b.label))
    : null;

  function renderTable(rows: InvoiceRow[], { showClient }: { showClient: boolean }) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Number</TableHead>
            {showClient && (
              <>
                <TableHead>Business</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Project</TableHead>
              </>
            )}
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Outstanding Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((invoice) => (
            <TableRow key={invoice.id} className="cursor-pointer" onClick={() => router.push(`/invoices/${invoice.id}`)}>
              <TableCell className="font-medium tabular-nums">{displayInvoiceNumber(invoice)}</TableCell>
              {showClient && (
                <>
                  <TableCell>{clientLabel(invoice.client)}</TableCell>
                  <TableCell>{invoice.client.name}</TableCell>
                  <TableCell className="text-muted-foreground">{projectLabel(invoice.client)}</TableCell>
                </>
              )}
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <InvoiceStatusBadge status={isInvoiceOverdue(invoice) ? "OVERDUE" : invoice.status} />
                  {isManualInvoice(invoice) && (
                    <span className="text-xs text-muted-foreground" title="Recorded manually — not billed through an online payment link">
                      (manual)
                    </span>
                  )}
                  {invoice.importedAt && (
                    <span className="text-xs text-muted-foreground" title="Created directly in Stripe, then imported into this app">
                      (imported)
                    </span>
                  )}
                  {invoice.editedAfterSendAt && (
                    <Badge
                      variant="outline"
                      className="border-sky-500/50 text-sky-600 dark:text-sky-400"
                      title={`Edited after sending on ${invoice.editedAfterSendAt.toLocaleDateString()} — the client's last copy may be out of date`}
                    >
                      Edited
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className={isInvoiceOverdue(invoice) ? "text-destructive" : undefined}>
                {invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{invoice.total != null ? `$${invoice.total.toFixed(2)}` : "—"}</TableCell>
              <TableCell className={`text-right tabular-nums ${isInvoiceOverdue(invoice) ? "text-destructive" : ""}`}>
                {outstandingBalance(invoice) > 0 ? `$${outstandingBalance(invoice).toFixed(2)}` : "—"}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={showClient ? 8 : 5} className="text-center text-muted-foreground">
                No invoices match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div className="flex items-center gap-1 rounded-full border border-input p-0.5 text-xs">
          <button
            type="button"
            onClick={() => changeGrouping(true)}
            className={`rounded-full px-2.5 py-1 transition-colors ${groupByClient ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            By client
          </button>
          <button
            type="button"
            onClick={() => changeGrouping(false)}
            className={`rounded-full px-2.5 py-1 transition-colors ${!groupByClient ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            All
          </button>
        </div>
      </div>

      {groups ? (
        <div className="space-y-3">
          {/* Collapsed by default — just the client/group names and totals up
              front, each one's invoices only load into view once clicked. */}
          {groups.map((group) => {
            const total = group.rows.reduce((sum, r) => sum + (r.total ?? 0), 0);
            // A ClientGroup bucket can span more than one distinct Client —
            // show the Business/Client columns inside it so rows stay
            // distinguishable; a single-client bucket doesn't need them,
            // same as before ClientGroup existed.
            const distinctClients = new Set(group.rows.map((r) => r.client.id)).size;
            return (
              <details key={group.key} className="group rounded-lg border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium select-none">
                  <span>
                    {group.label}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({group.rows.length} {group.rows.length === 1 ? "invoice" : "invoices"})
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">${total.toFixed(2)}</span>
                </summary>
                <div className="border-t px-4 pb-3">{renderTable(group.rows, { showClient: distinctClients > 1 })}</div>
              </details>
            );
          })}
          {groups.length === 0 && <p className="text-sm text-muted-foreground">No invoices match this filter.</p>}
        </div>
      ) : (
        renderTable(filtered, { showClient: true })
      )}
    </div>
  );
}
