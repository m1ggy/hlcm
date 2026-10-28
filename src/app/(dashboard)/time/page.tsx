import { auth } from "@/auth";
import { blockCaregiverRoute, isAdmin, isManagement } from "@/lib/rbac";
import { listTaskAssignableUsers } from "@/lib/actions/applications";
import { getAccount } from "@/lib/actions/account";
import { listCareRecipients } from "@/lib/actions/care-recipients";
import { MyTimeLog } from "@/components/time-clock/my-time-log";
import { TimesheetReport } from "@/components/time-clock/timesheet-report";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TimePage() {
  // Caregivers have their own hours page without the team timesheet.
  await blockCaregiverRoute("/hours");
  const session = await auth();
  const role = session?.user?.role;
  const canSeeAllUsers = isManagement(role);
  const canPay = isAdmin(role);

  const [users, account, recipients] = await Promise.all([
    // Includes caregivers: they clock visits, so admins need to filter to
    // them and fix or add their time (the staff-only list left them out).
    canSeeAllUsers ? listTaskAssignableUsers() : Promise.resolve([]),
    getAccount(),
    // For the visit picker when an admin adds or edits time.
    canPay ? listCareRecipients() : Promise.resolve([]),
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
            <p>As an admin or manager, you can also review everyone&apos;s hours from here.</p>
          )}
          {canPay && (
            <p>
              As an admin, use Add time for a missed punch, and the buttons on each row under &quot;Time by day&quot; to edit
              time, add an unpaid break inside a session, or delete. Deleting a break joins the time around it back into
              one paid session.
            </p>
          )}
        </PageInfoButton>
      </div>

      <Card data-tour="my-time">
        <CardHeader>
          <CardTitle>My Time</CardTitle>
        </CardHeader>
        <CardContent>
          <MyTimeLog accountTimezone={account.timezone} />
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
              recipients={recipients.map((r) => ({ id: r.id, name: r.name }))}
              accountTimezone={account.timezone}
              isAdmin={canPay}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
