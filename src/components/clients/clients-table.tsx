"use client";

import { useEffect, useState } from "react";
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
import type { ServiceMoney } from "@/lib/service-financials";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

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

export function ClientsTable({
  clients,
  canArchive,
  showArchived,
  archiveAction,
  restoreAction,
  moneyByClient,
}: {
  clients: ClientRow[];
  canArchive: boolean;
  // Null for anyone without invoice access — the money columns are left out.
  moneyByClient: Record<string, ServiceMoney> | null;
  showArchived: boolean;
  archiveAction: (id: string) => Promise<void>;
  restoreAction: (id: string) => Promise<void>;
}) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<ClientStatus>>(new Set());

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
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function toggleProject(projectId: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      window.localStorage.setItem(FILTER_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function clearFilter() {
    setSelectedProjectIds(new Set());
    window.localStorage.setItem(FILTER_KEY, JSON.stringify([]));
  }

  function toggleStatus(status: ClientStatus) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      window.localStorage.setItem(STATUS_FILTER_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function clearStatusFilter() {
    setSelectedStatuses(new Set());
    window.localStorage.setItem(STATUS_FILTER_KEY, JSON.stringify([]));
  }

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = clients
    .filter(
      (client) =>
        !q ||
        client.name.toLowerCase().includes(q) ||
        (client.contactInfo ?? "").toLowerCase().includes(q) ||
        (client.address ?? "").toLowerCase().includes(q)
    )
    .filter((client) => selectedProjectIds.size === 0 || client.projects.some((p) => selectedProjectIds.has(p.id)))
    .filter((client) => selectedStatuses.size === 0 || selectedStatuses.has(client.status));

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

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients..."
          className="pl-8"
          aria-label="Search clients"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={clearStatusFilter}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            selectedStatuses.size === 0
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-transparent text-muted-foreground hover:bg-muted"
          }`}
        >
          All statuses
        </button>
        {CLIENT_STATUSES.map((status) => {
          const count = clients.filter((c) => c.status === status).length;
          const selected = selectedStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-transparent text-muted-foreground hover:bg-muted"
              }`}
            >
              {CLIENT_STATUS_LABELS[status]}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {projectOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={clearFilter}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              selectedProjectIds.size === 0
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            All
          </button>
          {projectOptions.map((project) => {
            const count = clients.filter((c) => c.projects.some((p) => p.id === project.id)).length;
            const selected = selectedProjectIds.has(project.id);
            const { hex } = project.serviceType ?? UNMAPPED_SERVICE_COLOR;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => toggleProject(project.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
                {project.name}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      )}

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
          {filtered.map((client) => (
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
              {moneyByClient && (
                <>
                  <TableCell className="text-right tabular-nums">{formatMoney(moneyByClient[client.id]?.invoiced ?? 0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(moneyByClient[client.id]?.received ?? 0)}</TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${(moneyByClient[client.id]?.outstanding ?? 0) > 0 ? "text-destructive" : ""}`}
                  >
                    {formatMoney(moneyByClient[client.id]?.outstanding ?? 0)}
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
          ))}
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
