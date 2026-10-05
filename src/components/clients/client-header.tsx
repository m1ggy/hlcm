import Link from "next/link";
import type { ReactNode } from "react";
import { Mail, MapPin, Phone, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ServicePill } from "@/components/shared/service-pill";
import { EntityAvatar } from "@/components/shared/entity-avatar";
import { CLIENT_STATUS_BADGE_VARIANT, CLIENT_STATUS_LABELS, type ClientStatus } from "@/lib/client-status";

function Contact({ icon: Icon, value, label }: { icon: typeof User; value: string | null; label: string }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-start gap-2 lg:border-l lg:pl-4 lg:first:border-l-0 lg:first:pl-0">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" title={value}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Client profile header from the PDF mockups: initials, name and status,
 * business name, project tags, and a contact strip (primary contact, phone,
 * email, address). `actions` are the buttons on the right.
 */
export function ClientHeader({
  client,
  projects,
  primaryContact,
  actions,
}: {
  client: {
    name: string;
    status: ClientStatus;
    active: boolean;
    businessName: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
    address: string | null;
  };
  projects: { id: string; name: string; serviceType: { hex: string; textColor: string } | null }[];
  primaryContact: { name: string; phone: string | null; email: string | null } | null;
  actions: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <EntityAvatar name={client.name} />
          <div className="min-w-0 space-y-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              {client.name}
              <Badge variant={CLIENT_STATUS_BADGE_VARIANT[client.status]}>{CLIENT_STATUS_LABELS[client.status]}</Badge>
              {!client.active && <Badge variant="outline">Archived</Badge>}
            </h1>
            {client.businessName && client.businessName !== client.name && (
              <p className="text-muted-foreground">{client.businessName}</p>
            )}
            {projects.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {projects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`} className="transition-opacity hover:opacity-80">
                    <ServicePill label={project.name} service={project.serviceType} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Contact icon={User} value={primaryContact?.name ?? null} label="Primary contact" />
        <Contact icon={Phone} value={client.businessPhone ?? primaryContact?.phone ?? null} label="Phone" />
        <Contact icon={Mail} value={client.businessEmail ?? primaryContact?.email ?? null} label="Email" />
        <Contact icon={MapPin} value={client.address} label="Address" />
      </div>
    </div>
  );
}
