import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Read-only — no archive/create affordances, no project filter. A
// Caregiver's client list is small and derived purely from their own task
// assignments (see listCaregiverClients in src/lib/actions/clients.ts), so
// none of the admin ClientsTable's management features apply here.
type CaregiverClientRow = {
  id: string;
  name: string;
  contactInfo: string | null;
  address: string | null;
};

export function CaregiverClientsTable({ clients }: { clients: CaregiverClientRow[] }) {
  if (clients.length === 0) {
    return <p className="text-sm text-muted-foreground">No clients yet — you&apos;ll see one here once you&apos;re assigned a task on their case.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Address</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {clients.map((client) => (
          <TableRow key={client.id}>
            <TableCell className="font-medium">
              <Link href={`/clients/${client.id}`} className="hover:underline">
                {client.name}
              </Link>
            </TableCell>
            <TableCell>{client.contactInfo ?? "—"}</TableCell>
            <TableCell>{client.address ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
