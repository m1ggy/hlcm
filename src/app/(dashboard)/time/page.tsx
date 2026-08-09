import { auth } from "@/auth";
import { listAssignableUsers } from "@/lib/actions/applications";
import { MyTimeLog } from "@/components/time-clock/my-time-log";
import { TimesheetReport } from "@/components/time-clock/timesheet-report";
import { RecentPayouts } from "@/components/wise/recent-payouts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TimePage() {
  const session = await auth();
  const role = session?.user?.role;
  const canSeeAllUsers = role === "ADMIN" || role === "MANAGER";
  const canPay = role === "ADMIN";

  const users = canSeeAllUsers ? await listAssignableUsers() : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Time</h1>
        <p className="text-muted-foreground">Clock in and out from the header — sessions land here.</p>
      </div>

      <Card data-tour="my-time">
        <CardHeader>
          <CardTitle>My Time</CardTitle>
        </CardHeader>
        <CardContent>
          <MyTimeLog limit={50} />
        </CardContent>
      </Card>

      {canSeeAllUsers && (
        <Card data-tour="all-users-time">
          <CardHeader>
            <CardTitle>All users</CardTitle>
          </CardHeader>
          <CardContent>
            <TimesheetReport users={users.map((u) => ({ id: u.id, name: u.name }))} canPay={canPay} />
          </CardContent>
        </Card>
      )}

      {canPay && (
        <Card data-tour="recent-payouts">
          <CardHeader>
            <CardTitle>Recent payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentPayouts />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
