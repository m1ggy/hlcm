"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EditUserDialog } from "@/components/admin/edit-user-dialog";
import { RateCell } from "@/components/admin/rate-cell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ListedUser = {
  id: string;
  name: string;
  email: string;
  role: "DEVELOPER" | "OWNER" | "ADMIN" | "ACCOUNTANT" | "MANAGER" | "STAFF" | "CLIENT" | "CAREGIVER";
  active: boolean;
  hourlyRate: number | null;
  phone: string | null;
  smsRemindersEnabled: boolean;
};

export function UsersTable({
  users,
  currentUserId,
  canManageAdmins,
}: {
  users: ListedUser[];
  currentUserId: string | undefined;
  canManageAdmins: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.role.toLowerCase().includes(q)
    );
  }, [users, query]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or role..."
          className="pl-8"
        />
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
          {filtered.map((user) => (
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
                <EditUserDialog
                  user={user}
                  isSelf={user.id === currentUserId}
                  canManageAdmins={canManageAdmins}
                />
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                No users match &quot;{query}&quot;.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
