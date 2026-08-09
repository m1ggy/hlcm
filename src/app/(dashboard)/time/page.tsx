import { auth } from "@/auth";
import { listAssignableUsers } from "@/lib/actions/applications";
import { MyTimeLog } from "@/components/time-clock/my-time-log";
import { TimesheetReport } from "@/components/time-clock/timesheet-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TimePage() {
  const session = await auth();
  const role = session?.user?.role;
  const canSeeAllUsers = role === "ADMIN" || role === "MANAGER";

  const users = canSeeAllUsers ? await listAssignableUsers() : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Time</h1>
        <p className="text-muted-foreground">Clock in and out from the header — sessions land here.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Time</CardTitle>
        </CardHeader>
        <CardContent>
          <MyTimeLog limit={50} />
        </CardContent>
      </Card>

      {canSeeAllUsers && (
        <Card>
          <CardHeader>
            <CardTitle>All users</CardTitle>
          </CardHeader>
          <CardContent>
            <TimesheetReport users={users.map((u) => ({ id: u.id, name: u.name }))} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
