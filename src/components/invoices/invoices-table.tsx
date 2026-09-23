"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InvoiceStatusBadge, INVOICE_STATUS_LABELS, InvoiceStatusValue, isInvoiceOverdue, isManualInvoice } from "./invoice-status-badge";
import { displayInvoiceNumber, formatCalendarDate, outstandingBalance } from "@/lib/invoice-format";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  // Manual invoices only — a Stripe-billed invoice never has one (Stripe
  // emails those itself, with its own branding — see InvoiceProfile's own
  // comment in prisma/schema.prisma). Drives the "By profile" grouping
  // below, same reason Business/Client/Project columns exist for grouping.
  invoiceProfile: { id: string; name: string } | null;
  // Manual invoices only — which Care Recipient this bills for, if any
  // (see Invoice.careRecipientId). Shown as a small "For {name}" note so a
  // Client's invoice list stays legible even when it bills for more than
  // one recipient.
  careRecipient: { id: string; name: string } | null;
};

const FILTER_KEY = "hclm:invoices-filter";
const GROUP_KEY = "hclm:invoices-group-by";
const PROFILE_FILTER_KEY = "hclm:invoices-profile-filter";
type Filter = "all" | InvoiceStatusValue;
// "client" is the default and matches the old boolean key's "true" — kept
// as a distinct localStorage key (GROUP_KEY) rather than reusing the old
// boolean one, so a stale "true"/"false" string from before this existed
// can't be misread as a group mode. "profile" used to be a third value here
// (grouping BY profile) — it's now its own independent filter (below)
// instead, orthogonal to this toggle, so a stale "profile" string just
// falls through to the "client" default rather than being read as valid.
type GroupMode = "client" | "all";
const NO_PROFILE_KEY = "__no_profile__";
const NO_PROFILE_LABEL = "No profile (Stripe-billed)";
const ALL_PROFILES_KEY = "__all_profiles__";

function clientLabel(client: InvoiceRow["client"]) {
  return client.businessName ?? client.name;
}

// A client is occasionally in more than one Project (see the comment on
// Client.projects in prisma/schema.prisma) — joined rather than picking
// just one, so this column never silently drops one.
function projectLabel(client: InvoiceRow["client"]) {
  return client.projects.length > 0 ? client.projects.map((p) => p.name).join(", ") : "—";
}

// Not persisted like filter/groupMode/profileFilter below — a search query
// is a one-off "find this specific invoice right now", not a lasting view
// preference worth remembering across visits.
function matchesSearch(invoice: InvoiceRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    displayInvoiceNumber(invoice).toLowerCase().includes(q) ||
    clientLabel(invoice.client).toLowerCase().includes(q) ||
    invoice.client.name.toLowerCase().includes(q) ||
    (invoice.careRecipient?.name.toLowerCase().includes(q) ?? false) ||
    (invoice.total != null && invoice.total.toFixed(2).includes(q))
  );
}

export function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Grouped by client is the default — a flat "All" list (today's original
  // view, still newest-first) stays one click away for anyone who prefers it.
  const [groupMode, setGroupMode] = useState<GroupMode>("client");
  // Independent of groupMode — narrows which invoices show at all, same as
  // the status chips do, so "by client" and "all" both still work while
  // scoped to one billing identity (e.g. "just this Client Group's own
  // letterhead, grouped by client").
  const [profileFilter, setProfileFilter] = useState<string>(ALL_PROFILES_KEY);

  useEffect(() => {
    const id = setTimeout(() => {
      const savedFilter = window.localStorage.getItem(FILTER_KEY);
      if (savedFilter) setFilter(savedFilter as Filter);
      const savedGroup = window.localStorage.getItem(GROUP_KEY);
      if (savedGroup === "client" || savedGroup === "all") setGroupMode(savedGroup);
      const savedProfile = window.localStorage.getItem(PROFILE_FILTER_KEY);
      if (savedProfile) setProfileFilter(savedProfile);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function changeFilter(next: Filter) {
    setFilter(next);
    window.localStorage.setItem(FILTER_KEY, next);
  }

  function changeGrouping(next: GroupMode) {
    setGroupMode(next);
    window.localStorage.setItem(GROUP_KEY, next);
  }

  function changeProfileFilter(next: string) {
    setProfileFilter(next);
    window.localStorage.setItem(PROFILE_FILTER_KEY, next);
  }

  // Every billing identity actually used by at least one invoice — not a
  // separately-fetched list of all configured profiles, so a profile with
  // zero invoices here just doesn't clutter the picker. "No profile
  // (Stripe-billed)" only shows up as an option when at least one invoice
  // actually has none (see InvoiceProfile's comment in prisma/schema.prisma
  // for why a Stripe-billed invoice never has one).
  const profileOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let hasNoProfile = false;
    for (const invoice of invoices) {
      if (invoice.invoiceProfile) byId.set(invoice.invoiceProfile.id, invoice.invoiceProfile.name);
      else hasNoProfile = true;
    }
    const options = Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (hasNoProfile) options.push({ id: NO_PROFILE_KEY, name: NO_PROFILE_LABEL });
    return options;
  }, [invoices]);

  // Searched first — status chip counts and the profile filter both narrow
  // from there, so typing a query updates counts everywhere else too
  // instead of only affecting the rows shown.
  const searched = invoices.filter((invoice) => matchesSearch(invoice, search));

  // "All" follows the same hide-by-default pattern as archived clients/
  // projects — a voided invoice is done, nothing left to act on, and
  // shouldn't clutter the main list. It's still one click away via its own
  // "Void" chip, same as archived items get their own explicit view.
  const filtered = searched
    .filter((invoice) => (filter === "all" ? invoice.status !== "VOID" : invoice.status === filter))
    .filter((invoice) => {
      if (profileFilter === ALL_PROFILES_KEY) return true;
      if (profileFilter === NO_PROFILE_KEY) return !invoice.invoiceProfile;
      return invoice.invoiceProfile?.id === profileFilter;
    });

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: searched.filter((i) => i.status !== "VOID").length },
    ...(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatusValue[]).map((s) => ({
      key: s,
      label: INVOICE_STATUS_LABELS[s],
      count: searched.filter((i) => i.status === s).length,
    })),
  ];

  // Invoices already arrive newest-first (see listInvoices); grouping just
  // buckets that same order, it doesn't re-sort within a bucket. Bucketed
  // by ClientGroup when the client belongs to one (see Client.clientGroup
  // in prisma/schema.prisma — a client group merges several clients into
  // one section, e.g. a holding company's separate locations), falling
  // back to the individual client otherwise.
  // A search result should be immediately visible, not buried inside a
  // collapsed-by-default group the user then has to go find and expand —
  // so an active search flattens the list the same way "All" grouping
  // does, regardless of which grouping mode is otherwise selected.
  const groups =
    groupMode === "all" || search.trim()
      ? null
      : Object.values(
          filtered.reduce<Record<string, { key: string; label: string; rows: InvoiceRow[] }>>((acc, invoice) => {
            const key = invoice.client.clientGroupId ?? invoice.client.id;
            const label = invoice.client.clientGroup?.name ?? clientLabel(invoice.client);
            const bucket = acc[key] ?? { key, label, rows: [] };
            bucket.rows.push(invoice);
            acc[key] = bucket;
            return acc;
          }, {})
        ).sort((a, b) => a.label.localeCompare(b.label));

  // A Client bucket that bills more than one Care Recipient (an agency
  // like a large home-care client billing many recipients) otherwise reads
  // as one undifferentiated pile — each invoice only gets a small muted
  // "For {name}" subtext to tell recipients apart. Sub-bucket by recipient,
  // same shape/sort as the outer Client(Group) grouping above, so each one
  // gets its own collapsible row and outstanding total. A bucket with zero
  // or one recipient (the common case) skips this — see the `.length > 1`
  // check at the call site — so an ordinary Client's invoices still render
  // as a single flat table, unchanged.
  function recipientSubgroups(rows: InvoiceRow[]) {
    return Object.values(
      rows.reduce<Record<string, { key: string; label: string; rows: InvoiceRow[] }>>((acc, invoice) => {
        const key = invoice.careRecipient?.id ?? "__none__";
        const label = invoice.careRecipient?.name ?? "General (no recipient)";
        const bucket = acc[key] ?? { key, label, rows: [] };
        bucket.rows.push(invoice);
        acc[key] = bucket;
        return acc;
      }, {})
    ).sort((a, b) => (a.key === "__none__" ? -1 : b.key === "__none__" ? 1 : a.label.localeCompare(b.label)));
  }

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
                  <TableCell>
                    {invoice.client.name}
                    {invoice.careRecipient && (
                      <div className="text-xs text-muted-foreground">For {invoice.careRecipient.name}</div>
                    )}
                  </TableCell>
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
                {invoice.dueDate ? formatCalendarDate(invoice.dueDate) : "—"}
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
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by invoice number, client, recipient, or amount..."
        className="max-w-sm"
      />
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
        <div className="flex flex-wrap items-center gap-2">
          {profileOptions.length > 0 && (
            <Select
              items={{
                [ALL_PROFILES_KEY]: "All profiles",
                ...Object.fromEntries(profileOptions.map((p) => [p.id, p.name])),
              }}
              value={profileFilter}
              onValueChange={(v) => changeProfileFilter(v ?? ALL_PROFILES_KEY)}
            >
              <SelectTrigger size="sm" className="w-[11rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROFILES_KEY}>All profiles</SelectItem>
                {profileOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1 rounded-full border border-input p-0.5 text-xs">
            <button
              type="button"
              onClick={() => changeGrouping("client")}
              className={`rounded-full px-2.5 py-1 transition-colors ${groupMode === "client" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              By client
            </button>
            <button
              type="button"
              onClick={() => changeGrouping("all")}
              className={`rounded-full px-2.5 py-1 transition-colors ${groupMode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {groups ? (
        <div className="space-y-3">
          {/* Collapsed by default — just the group name and outstanding
              balance up front, each one's invoices only load into view once
              clicked. Outstanding rather than billed total, so this view
              doubles as a collections worklist. */}
          {groups.map((group) => {
            const outstanding = group.rows.reduce((sum, r) => sum + outstandingBalance(r), 0);
            // A ClientGroup bucket can span more than one distinct Client,
            // and a profile bucket almost always does (a billing identity
            // isn't tied to one client) — show the Business/Client columns
            // inside it so rows stay distinguishable; a single-client
            // bucket doesn't need them, same as before ClientGroup existed.
            const distinctClients = new Set(group.rows.map((r) => r.client.id)).size;
            const subgroups = recipientSubgroups(group.rows);
            return (
              <details key={group.key} className="group rounded-lg border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium select-none">
                  <span>
                    {group.label}{" "}
                    <span className="font-normal text-muted-foreground">
                      ({group.rows.length} {group.rows.length === 1 ? "invoice" : "invoices"})
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">${outstanding.toFixed(2)}</span>
                </summary>
                <div className="space-y-2 border-t px-4 pb-3 pt-2">
                  {subgroups.length > 1
                    ? subgroups.map((sub) => {
                        const subOutstanding = sub.rows.reduce((sum, r) => sum + outstandingBalance(r), 0);
                        return (
                          <details key={sub.key} className="group/recipient rounded-lg border">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm select-none">
                              <span>
                                {sub.label}{" "}
                                <span className="font-normal text-muted-foreground">
                                  ({sub.rows.length} {sub.rows.length === 1 ? "invoice" : "invoices"})
                                </span>
                              </span>
                              <span className="tabular-nums text-muted-foreground">${subOutstanding.toFixed(2)}</span>
                            </summary>
                            <div className="border-t px-3 pb-2 pt-1">
                              {renderTable(sub.rows, { showClient: distinctClients > 1 })}
                            </div>
                          </details>
                        );
                      })
                    : renderTable(group.rows, { showClient: distinctClients > 1 })}
                </div>
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
