"use client";

import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import Link from "next/link";
import { ArchiveButton } from "@/components/shared/archive-button";
import { ServicePill } from "@/components/shared/service-pill";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UNMAPPED_SERVICE_COLOR } from "@/lib/service-type";
import { CLIENT_STATUS_LABELS, CLIENT_STATUSES, CLIENT_STATUS_BADGE_VARIANT, type ClientStatus } from "@/lib/client-status";
import { formatMoney } from "@/lib/time-entries";
import {
  NO_PROFILE,
  clientMatchesFilters,
  filtersToSearchParams,
  moneyForProfiles,
  type ClientListFilters,
  type ClientMoney,
} from "@/lib/client-list-filters";
import { Download, Search, X } from "lucide-react";
import { FilterMenu, type FilterOption } from "@/components/shared/filter-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ServiceTypeRef = { hex: string; textColor: string } | null;

type ClientProject = { id: string; name: string; serviceType: ServiceTypeRef };

type ClientRow = {
  id: string;
  name: string;
  contactInfo: string | null;
  address: string | null;
  status: ClientStatus;
  projects: ClientProject[];
  _count: { services: number };
};

const FILTER_KEY = "hclm:clients-project-filter";
const STATUS_FILTER_KEY = "hclm:clients-status-filter";
const PROFILE_FILTER_KEY = "hclm:clients-profile-filter";

export function ClientsTable({
  clients,
  canArchive,
  showArchived,
  archiveAction,
  restoreAction,
  moneyByClient,
  invoiceProfiles,
  header,
  actions,
}: {
  // The page's title block and its own header buttons — rendered here so
  // the Export button (which needs the live filters) can sit beside them.
  header: ReactNode;
  actions?: ReactNode;
  clients: ClientRow[];
  canArchive: boolean;
  // Null for anyone without invoice access — the money columns, profile
  // filter and invoice export are left out.
  moneyByClient: Record<string, ClientMoney> | null;
  invoiceProfiles: { id: string; name: string }[];
  showArchived: boolean;
  archiveAction: (id: string) => Promise<void>;
  restoreAction: (id: string) => Promise<void>;
}) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ClientStatus>>(new Set());
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const id = setTimeout(() => {
      const saved = window.localStorage.getItem(FILTER_KEY);
      if (saved) {
        try {
          setSelectedProjectIds(new Set(JSON.parse(saved) as string[]));
        } catch {
          // ignore malformed storage
        }
      }
      const savedStatus = window.localStorage.getItem(STATUS_FILTER_KEY);
      if (savedStatus) {
        try {
          setSelectedStatuses(new Set(JSON.parse(savedStatus) as ClientStatus[]));
        } catch {
          // ignore malformed storage
        }
      }
      const savedProfiles = window.localStorage.getItem(PROFILE_FILTER_KEY);
      if (savedProfiles) {
        try {
          setSelectedProfileIds(new Set(JSON.parse(savedProfiles) as string[]));
        } catch {
          // ignore malformed storage
        }
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // Every filter is a Set persisted to its own localStorage key.
  function toggleIn<T>(setter: Dispatch<SetStateAction<Set<T>>>, key: string, value: T) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      window.localStorage.setItem(key, JSON.stringify([...next]));
      return next;
    });
  }

  function clearIn<T>(setter: Dispatch<SetStateAction<Set<T>>>, key: string) {
    setter(new Set());
    window.localStorage.setItem(key, JSON.stringify([]));
  }

  const [query, setQuery] = useState("");

  // Derived from the clients already on screen (not a separate project
  // fetch) — naturally scoped to active vs archived, and never offers a
  // project with zero clients in the current view.
  const projectOptions: ClientProject[] = [];
  const seenProjectIds = new Set<string>();
  for (const client of clients) {
    for (const project of client.projects) {
      if (seenProjectIds.has(project.id)) continue;
      seenProjectIds.add(project.id);
      projectOptions.push(project);
    }
  }
  projectOptions.sort((a, b) => a.name.localeCompare(b.name));

  // Derived from the clients' billed invoices (not the full profile list) —
  // never offers a profile no client on screen has billed under.
  const profileOptions: FilterOption[] = [];
  if (moneyByClient) {
    const countFor = (profileId: string) =>
      clients.filter((c) => (moneyByClient[c.id]?.byProfile[profileId]?.invoiceCount ?? 0) > 0).length;
    for (const profile of invoiceProfiles) {
      const count = countFor(profile.id);
      if (count > 0) profileOptions.push({ value: profile.id, label: profile.name, count });
    }
    const noneCount = countFor(NO_PROFILE);
    if (noneCount > 0) profileOptions.push({ value: NO_PROFILE, label: "No profile", count: noneCount });
  }

  // A saved selection for a project/profile that's no longer offered is
  // ignored, so it can't silently hide every client behind an invisible
  // filter.
  const activeProjectIds = projectOptions.map((p) => p.id).filter((id) => selectedProjectIds.has(id));
  const activeProfileIds = profileOptions.map((p) => p.value).filter((id) => selectedProfileIds.has(id));

  const filters: ClientListFilters = {
    query,
    statuses: [...selectedStatuses],
    projectIds: activeProjectIds,
    profileIds: activeProfileIds,
  };
  const filtered = clients.filter((client) => clientMatchesFilters(client, filters, moneyByClient));
  const anyFilter =
    query.trim() !== "" || filters.statuses.length + activeProjectIds.length + activeProfileIds.length > 0;
  const exportHref = (format: string) => {
    const params = filtersToSearchParams(filters, showArchived);
    params.set("format", format);
    return `/api/export/clients?${params}`;
  };

  function clearAll() {
    setQuery("");
    clearIn(setSelectedStatuses, STATUS_FILTER_KEY);
    clearIn(setSelectedProjectIds, FILTER_KEY);
    clearIn(setSelectedProfileIds, PROFILE_FILTER_KEY);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {header}
        <div className="flex items-center gap-2">
          {moneyByClient && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline">
                    <Download className="size-4" />
                    Export
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-auto min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    Invoices &amp; payments summary
                    {anyFilter && <span className="block font-normal">For the {filtered.length} filtered clients</span>}
                  </DropdownMenuLabel>
                  <DropdownMenuItem render={<a href={exportHref("xlsx")} />}>Excel (.xlsx)</DropdownMenuItem>
                  <DropdownMenuItem render={<a href={exportHref("pdf")} />}>PDF</DropdownMenuItem>
                  <DropdownMenuItem render={<a href={exportHref("csv")} />}>CSV</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {actions}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients..."
              className="pl-8"
              aria-label="Search clients"
            />
          </div>
          <FilterMenu
            label="Status"
            options={CLIENT_STATUSES.map((status) => ({
              value: status,
              label: CLIENT_STATUS_LABELS[status],
              count: clients.filter((c) => c.status === status).length,
            }))}
            selected={filters.statuses}
            onToggle={(value) => toggleIn(setSelectedStatuses, STATUS_FILTER_KEY, value as ClientStatus)}
            onClear={() => clearIn(setSelectedStatuses, STATUS_FILTER_KEY)}
          />
          {projectOptions.length > 0 && (
            <FilterMenu
              label="Project"
              options={projectOptions.map((project) => ({
                value: project.id,
                label: project.name,
                count: clients.filter((c) => c.projects.some((p) => p.id === project.id)).length,
                icon: (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: (project.serviceType ?? UNMAPPED_SERVICE_COLOR).hex }}
                  />
                ),
              }))}
              selected={activeProjectIds}
              onToggle={(value) => toggleIn(setSelectedProjectIds, FILTER_KEY, value)}
              onClear={() => clearIn(setSelectedProjectIds, FILTER_KEY)}
            />
          )}
          {profileOptions.length > 0 && (
            <FilterMenu
              label="Invoice profile"
              options={profileOptions}
              selected={activeProfileIds}
              onToggle={(value) => toggleIn(setSelectedProfileIds, PROFILE_FILTER_KEY, value)}
              onClear={() => clearIn(setSelectedProfileIds, PROFILE_FILTER_KEY)}
            />
          )}
          {anyFilter && (
            <Button variant="ghost" onClick={clearAll} className="text-muted-foreground">
              <X className="size-4" />
              Clear filters
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {anyFilter ? `Showing ${filtered.length} of ${clients.length} clients` : `${clients.length} clients`}
          {activeProfileIds.length > 0 && " · totals count only the selected invoice profiles"}
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client Name</TableHead>
            <TableHead className="text-right">Total Services</TableHead>
            {moneyByClient && (
              <>
                <TableHead className="text-right">Total Invoiced</TableHead>
                <TableHead className="text-right">Total Received</TableHead>
                <TableHead className="text-right">Total Outstanding</TableHead>
              </>
            )}
            <TableHead>Status</TableHead>
            <TableHead>Projects</TableHead>
            {canArchive && <TableHead className="w-10 text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((client) => {
            const money = moneyByClient ? moneyForProfiles(moneyByClient[client.id], activeProfileIds) : null;
            return (
              <TableRow key={client.id}>
                <TableCell className="font-medium">
                  <Link href={`/clients/${client.id}`} className="text-primary hover:underline">
                    {client.name}
                  </Link>
                  {showArchived && (
                    <Badge variant="outline" className="ml-2">
                      Archived
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{client._count.services}</TableCell>
                {money && (
                  <>
                    <TableCell className="text-right tabular-nums">{formatMoney(money.invoiced)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(money.received)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${money.outstanding > 0 ? "text-destructive" : ""}`}>
                      {formatMoney(money.outstanding)}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <Badge variant={CLIENT_STATUS_BADGE_VARIANT[client.status]}>{CLIENT_STATUS_LABELS[client.status]}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {client.projects.map((project) => (
                      <Link key={project.id} href={`/projects/${project.id}`} className="transition-opacity hover:opacity-80">
                        <ServicePill label={project.name} service={project.serviceType} />
                      </Link>
                    ))}
                  </div>
                </TableCell>
                {canArchive && (
                  <TableCell className="text-right">
                    <ArchiveButton
                      id={client.id}
                      label={client.name}
                      archived={showArchived}
                      archiveAction={archiveAction}
                      restoreAction={restoreAction}
                    />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={(canArchive ? 5 : 4) + (moneyByClient ? 3 : 0)} className="text-center text-muted-foreground">
                {clients.length === 0
                  ? showArchived
                    ? "No archived clients."
                    : "No clients yet."
                  : "No clients match this filter."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
