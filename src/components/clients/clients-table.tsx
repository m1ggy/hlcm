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

type ServiceTypeRef = { hex: string; textColor: string } | null;

type ClientProject = { id: string; name: string; serviceType: ServiceTypeRef };

type ClientRow = {
  id: string;
  name: string;
  contactInfo: string | null;
  address: string | null;
  projects: ClientProject[];
};

const FILTER_KEY = "hclm:clients-project-filter";

export function ClientsTable({
  clients,
  canArchive,
  showArchived,
  archiveAction,
  restoreAction,
}: {
  clients: ClientRow[];
  canArchive: boolean;
  showArchived: boolean;
  archiveAction: (id: string) => Promise<void>;
  restoreAction: (id: string) => Promise<void>;
}) {
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

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

  const filtered =
    selectedProjectIds.size === 0
      ? clients
      : clients.filter((client) => client.projects.some((p) => selectedProjectIds.has(p.id)));

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
            <TableHead>Name</TableHead>
            <TableHead>Projects</TableHead>
            <TableHead>Contact Info</TableHead>
            <TableHead>Address</TableHead>
            {canArchive && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
                {showArchived && (
                  <Badge variant="outline" className="ml-2">
                    Archived
                  </Badge>
                )}
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
              <TableCell>{client.contactInfo ?? "—"}</TableCell>
              <TableCell>{client.address ?? "—"}</TableCell>
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
              <TableCell colSpan={canArchive ? 5 : 4} className="text-center text-muted-foreground">
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
