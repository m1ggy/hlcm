import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ClientSummary = {
  id: string;
  name: string;
  businessName: string | null;
  businessPhone: string | null;
  businessEmail: string | null;
  address: string | null;
  contactInfo: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
};

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

// Read-only snapshot of the client's contact info in the application's side
// panel — full editing (notes, audit log, etc.) still lives on the client's
// own detail page, linked out via the header.
export function ClientSummaryCard({ client }: { client: ClientSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Client</span>
          <Link
            href={`/clients/${client.id}`}
            className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
          >
            Open client <ArrowUpRight className="size-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p className="mb-2 font-medium">{client.businessName || client.name}</p>
        <Row label="Address" value={client.address} />
        <Row label="Business phone" value={client.businessPhone} />
        <Row label="Business email" value={client.businessEmail} />
        <Row label="Other contact" value={client.contactInfo} />
        {(client.ownerName || client.ownerPhone || client.ownerEmail) && (
          <>
            <div className="my-2 border-t" />
            <Row label="Owner" value={client.ownerName} />
            <Row label="Owner phone" value={client.ownerPhone} />
            <Row label="Owner email" value={client.ownerEmail} />
          </>
        )}
        {!client.address &&
          !client.businessPhone &&
          !client.businessEmail &&
          !client.contactInfo &&
          !client.ownerName &&
          !client.ownerPhone &&
          !client.ownerEmail && (
            <p className="text-sm text-muted-foreground">No contact details on file yet.</p>
          )}
      </CardContent>
    </Card>
  );
}
