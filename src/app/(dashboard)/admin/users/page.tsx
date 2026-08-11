import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { auth } from "@/auth";
import { listUsers } from "@/lib/actions/users";
import { NewUserDialog } from "@/components/admin/new-user-dialog";
import { EditUserDialog } from "@/components/admin/edit-user-dialog";
import { RateCell } from "@/components/admin/rate-cell";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Badge } from "@/components/ui/badge";
import { ForbiddenError } from "@/lib/rbac";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function UsersPage() {
  const session = await auth();
  let users;
  try {
    users = await listUsers();
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Users</h1>
          <PageInfoButton title="Users">
            <p>Manage everyone on staff — their name, email, login, role, and whether their account is active.</p>
            <p>
              Set each person&apos;s hourly pay rate here too — it&apos;s what turns their logged hours into a
              paycheck total on the{" "}
              <Link href="/time" className="inline-flex items-center gap-0.5 underline">
                Time <ArrowUpRight className="size-3" />
              </Link>{" "}
              page.
            </p>
          </PageInfoButton>
        </div>
        <NewUserDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rate</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>
                <Badge variant={user.active ? "default" : "outline"}>
                  {user.active ? "Active" : "Deactivated"}
                </Badge>
              </TableCell>
              <TableCell>
                <RateCell userId={user.id} initialRate={user.hourlyRate} />
              </TableCell>
              <TableCell>
                <EditUserDialog user={user} isSelf={user.id === session?.user?.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
