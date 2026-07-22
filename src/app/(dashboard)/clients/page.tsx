import Link from "next/link";
import { listClients } from "@/lib/actions/clients";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Clients</h1>
        <p className="text-muted-foreground">
          Clients are added from within a{" "}
          <Link href="/projects" className="underline">
            Project
          </Link>
          .
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Contact Info</TableHead>
            <TableHead>Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.name}</TableCell>
              <TableCell>
                <Link href={`/projects/${client.projectId}`} className="hover:underline">
                  {client.project.name}
                </Link>
              </TableCell>
              <TableCell>{client.contactInfo ?? "—"}</TableCell>
              <TableCell>{client.address ?? "—"}</TableCell>
            </TableRow>
          ))}
          {clients.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No clients yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
