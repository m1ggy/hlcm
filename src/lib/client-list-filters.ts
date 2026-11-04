import type { ServiceMoney } from "@/lib/service-financials";

// The Clients list's filters (search, status, project, invoice profile),
// shared by the table that applies them on screen and the
// /api/export/clients route that re-applies them server-side — so the
// downloaded file always lists exactly the clients that were showing.

// Stands in for "no profile" — Stripe-bound invoices (never get one) and
// manual invoices whose profile was deleted since.
export const NO_PROFILE = "none";

// A client's billed totals (see listMoneyByClient): `total` is the full
// client-level figure, adjustments included; `byProfile` splits just the
// invoices by Invoice.invoiceProfileId (NO_PROFILE for null). Adjustments
// belong to a service, not a profile, so they're only ever in `total`.
export type ClientMoney = { total: ServiceMoney; byProfile: Record<string, ServiceMoney> };

export type ClientListFilters = {
  query: string;
  statuses: string[];
  projectIds: string[];
  profileIds: string[];
};

type FilterableClient = {
  id: string;
  name: string;
  contactInfo: string | null;
  address: string | null;
  status: string;
  projects: { id: string }[];
};

export function clientMatchesFilters(
  client: FilterableClient,
  filters: ClientListFilters,
  money: Record<string, ClientMoney> | null
): boolean {
  const q = filters.query.trim().toLowerCase();
  if (
    q &&
    !client.name.toLowerCase().includes(q) &&
    !(client.contactInfo ?? "").toLowerCase().includes(q) &&
    !(client.address ?? "").toLowerCase().includes(q)
  ) {
    return false;
  }
  if (filters.projectIds.length > 0 && !client.projects.some((p) => filters.projectIds.includes(p.id))) return false;
  if (filters.statuses.length > 0 && !filters.statuses.includes(client.status)) return false;
  // Ignored without money access — the profile chips aren't shown then.
  if (money && filters.profileIds.length > 0) {
    const byProfile = money[client.id]?.byProfile ?? {};
    if (!filters.profileIds.some((id) => (byProfile[id]?.invoiceCount ?? 0) > 0)) return false;
  }
  return true;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The client's totals as the current profile filter sees them: the full
 * figure when no profile is picked, otherwise just those profiles'
 * invoices (no adjustments — see ClientMoney). */
export function moneyForProfiles(money: ClientMoney | undefined, profileIds: string[]): ServiceMoney {
  const sum: ServiceMoney = { invoiced: 0, received: 0, adjustments: 0, outstanding: 0, invoiceCount: 0 };
  if (!money) return sum;
  if (profileIds.length === 0) return money.total;
  for (const id of profileIds) {
    const m = money.byProfile[id];
    if (!m) continue;
    sum.invoiced = round(sum.invoiced + m.invoiced);
    sum.received = round(sum.received + m.received);
    sum.outstanding = round(sum.outstanding + m.outstanding);
    sum.invoiceCount += m.invoiceCount;
  }
  return sum;
}

export function filtersToSearchParams(filters: ClientListFilters, archived: boolean): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  for (const s of filters.statuses) params.append("status", s);
  for (const id of filters.projectIds) params.append("project", id);
  for (const id of filters.profileIds) params.append("profile", id);
  if (archived) params.set("archived", "1");
  return params;
}

export function filtersFromSearchParams(params: URLSearchParams): { filters: ClientListFilters; archived: boolean } {
  return {
    filters: {
      query: params.get("q") ?? "",
      statuses: params.getAll("status"),
      projectIds: params.getAll("project"),
      profileIds: params.getAll("profile"),
    },
    archived: params.get("archived") === "1",
  };
}
