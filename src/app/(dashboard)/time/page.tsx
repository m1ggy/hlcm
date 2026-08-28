import { auth } from "@/auth";
import { listAssignableUsers } from "@/lib/actions/applications";
import { getAccount } from "@/lib/actions/account";
import { MyTimeLog } from "@/components/time-clock/my-time-log";
import { TimesheetReport } from "@/components/time-clock/timesheet-report";
import { RecentPayouts } from "@/components/wise/recent-payouts";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TimePage() {
  const session = await auth();
  const role = session?.user?.role;
  const canSeeAllUsers = role === "ADMIN" || role === "MANAGER";
  const canPay = role === "ADMIN";

  const [users, account] = await Promise.all([
    canSeeAllUsers ? listAssignableUsers() : Promise.resolve([]),
    getAccount(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">Time</h1>
        <PageInfoButton title="Time">
          <p>
            Track hours worked. Use the clock-in button at the top of the page when your shift starts and clock
            out when it ends — every session you log shows up here.
          </p>
          {canSeeAllUsers && (
            <p>As an admin or manager, you can also review everyone&apos;s hours and process pay from here.</p>
          )}
          {canPay && (
            <p>As an admin, hit Preview to see individual sessions below the totals — add a missed punch or delete a mistaken one from there.</p>
          )}
        </PageInfoButton>
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
            <TimesheetReport
              users={users.map((u) => ({ id: u.id, name: u.name }))}
              accountTimezone={account.timezone}
              isAdmin={canPay}
            />
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
