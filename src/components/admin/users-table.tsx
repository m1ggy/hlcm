"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EditUserDialog } from "@/components/admin/edit-user-dialog";
import { RateCell } from "@/components/admin/rate-cell";
import { LoginActivityCell } from "@/components/admin/login-activity-cell";
import type { LoginSummary } from "@/lib/actions/login-activity";
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
  smsDailyUpdates: boolean;
  smsOptedOutAt: Date | null;
  /** Set for a managing company's assigned person — read-only here. */
  assignedFromUserId?: string | null;
};

export function UsersTable({
  users,
  currentUserId,
  canManageAdmins,
  loginSummaries,
  viewerTimezone = null,
  managedByName = null,
  dailyTextAvailable = false,
}: {
  /** The workspace sends the evening text (a client's tasks workspace) — the edit dialog offers signing people up. */
  dailyTextAvailable?: boolean;
  users: ListedUser[];
  currentUserId: string | undefined;
  canManageAdmins: boolean;
  /** The managing company's name, for the "From …" label on its assigned people. */
  managedByName?: string | null;
  /** Only passed for a DEVELOPER viewer — adds the "Last sign-in" column. */
  loginSummaries?: Record<string, LoginSummary>;
  viewerTimezone?: string | null;
}) {
  const showLogins = !!loginSummaries;
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
            {showLogins && <TableHead>Last sign-in</TableHead>}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">
                {user.name}
                {user.assignedFromUserId && (
                  <Badge variant="secondary" className="ml-2" title="Assigned by your managing company — they add and remove these people">
                    {managedByName ? `From ${managedByName}` : "Assigned"}
                  </Badge>
                )}
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>
                <Badge variant={user.active ? "default" : "outline"}>
                  {user.active ? "Active" : "Deactivated"}
                </Badge>
              </TableCell>
              <TableCell>
                {user.assignedFromUserId ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <RateCell userId={user.id} initialRate={user.hourlyRate} />
                )}
              </TableCell>
              {showLogins && (
                <TableCell>
                  <LoginActivityCell
                    userId={user.id}
                    userName={user.name}
                    summary={loginSummaries[user.id]}
                    viewerTimezone={viewerTimezone}
                  />
                </TableCell>
              )}
              <TableCell>
                {!user.assignedFromUserId && (
                  <EditUserDialog
                    user={user}
                    isSelf={user.id === currentUserId}
                    canManageAdmins={canManageAdmins}
                    dailyTextAvailable={dailyTextAvailable}
                  />
                )}
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={showLogins ? 7 : 6} className="text-center text-sm text-muted-foreground">
                No users match &quot;{query}&quot;.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
