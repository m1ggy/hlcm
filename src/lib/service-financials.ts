// Per-service money summary behind the client page's financial tiles, the
// service pages and the reports. Pure (no DB) — the client total is always
// computed here as the sum of the service rows, never stored, so it can't
// drift from the invoices and adjustments underneath it.

type InvoiceForSummary = {
  status: string;
  total: number | null;
  amountPaid: number | null;
  clientServiceId: string | null;
};

type AdjustmentForSummary = { clientServiceId: string; amount: number };

// outstanding = invoiced − received + adjustments (PDF §5). Adjustments are
// signed (see ServiceAdjustment): a credit is negative, so a service can end
// up with a negative outstanding — a credit balance in the client's favor.
export type ServiceMoney = {
  invoiced: number;
  received: number;
  adjustments: number;
  outstanding: number;
  invoiceCount: number;
};

// Invoices that were actually billed. Draft was never sent; Void owes
// nothing and (after voidInvoiceWithPayments) has amountPaid reset, so
// counting it would only understate "received".
const BILLED_STATUSES = new Set(["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"]);

function zero(): ServiceMoney {
  return { invoiced: 0, received: 0, adjustments: 0, outstanding: 0, invoiceCount: 0 };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** What one billed invoice contributes. A Stripe-paid invoice never sets
 * amountPaid (only manual payments do), so PAID counts its full total. */
export function invoiceMoney(invoice: Omit<InvoiceForSummary, "clientServiceId">): ServiceMoney {
  if (!BILLED_STATUSES.has(invoice.status)) return zero();
  const invoiced = invoice.total ?? 0;
  const received = invoice.status === "PAID" ? invoiced : Math.min(invoice.amountPaid ?? 0, invoiced);
  return { invoiced, received, adjustments: 0, outstanding: Math.max(0, invoiced - received), invoiceCount: 1 };
}

function add(a: ServiceMoney, b: ServiceMoney): ServiceMoney {
  return {
    invoiced: round(a.invoiced + b.invoiced),
    received: round(a.received + b.received),
    adjustments: round(a.adjustments + b.adjustments),
    outstanding: round(a.outstanding + b.outstanding),
    invoiceCount: a.invoiceCount + b.invoiceCount,
  };
}

/**
 * Groups a client's invoices and adjustments by service. `byService` has an
 * entry for every id in `serviceIds` (zeros when nothing's billed yet) so
 * every service shows up in the breakdown; invoices with no service land in
 * `general`. `total` is the sum of everything — the client-level figure.
 */
export function summarizeByService(
  invoices: InvoiceForSummary[],
  serviceIds: string[],
  adjustments: AdjustmentForSummary[] = []
) {
  const byService = new Map<string, ServiceMoney>(serviceIds.map((id) => [id, zero()]));
  let general = zero();
  for (const invoice of invoices) {
    const money = invoiceMoney(invoice);
    if (invoice.clientServiceId && byService.has(invoice.clientServiceId)) {
      byService.set(invoice.clientServiceId, add(byService.get(invoice.clientServiceId)!, money));
    } else {
      general = add(general, money);
    }
  }
  for (const adjustment of adjustments) {
    const current = byService.get(adjustment.clientServiceId);
    if (!current) continue;
    byService.set(
      adjustment.clientServiceId,
      add(current, { ...zero(), adjustments: adjustment.amount, outstanding: adjustment.amount })
    );
  }
  const total = [...byService.values()].reduce(add, general);
  return { byService, general, total };
}
