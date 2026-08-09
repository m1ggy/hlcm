import { notFound } from "next/navigation";
import { listUsers } from "@/lib/actions/users";
import { NewUserDialog } from "@/components/admin/new-user-dialog";
import { RateCell } from "@/components/admin/rate-cell";
import { TimesheetReport } from "@/components/admin/timesheet-report";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <h1 className="text-2xl font-semibold">Users</h1>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Card>
        <CardHeader>
          <CardTitle>Timesheet report</CardTitle>
        </CardHeader>
        <CardContent>
          <TimesheetReport users={users.map((u) => ({ id: u.id, name: u.name }))} />
        </CardContent>
      </Card>
    </div>
  );
}
