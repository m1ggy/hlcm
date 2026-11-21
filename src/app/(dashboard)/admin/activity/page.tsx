import Link from "next/link";
import { notFound } from "next/navigation";
import { ForbiddenError, blockCaregiverRoute } from "@/lib/rbac";
import { getTeamActivity } from "@/lib/activity-data";
import { TeamActivityTable } from "@/components/activity/team-activity-table";
import { DayPicker } from "@/components/activity/day-picker";
import { ActivityExport } from "@/components/activity/activity-export";
import { CopySetupLink } from "@/components/activity/copy-setup-link";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Button } from "@/components/ui/button";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await blockCaregiverRoute();
  const { date } = await searchParams;
  let data;
  try {
    data = await getTeamActivity(date);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h1 className="text-2xl font-semibold">Activity</h1>
          <PageInfoButton title="Activity">
            <p>
              What the desktop app recorded for this workspace&apos;s own staff: who is working now, screenshots, and the apps and
              sites they used. It never records keyboard or mouse input; after 2 hours with none, it clocks the person out. Only the
              owner (and developers) can see this page. Each person can see their own data under Time &gt; My activity.
            </p>
            <p>
              <strong>Productive</strong> is the share of tracked time in apps and sites your app rules mark Productive. It
              doesn&apos;t change paid hours.
            </p>
            <p>
              Anyone marked &quot;app not installed&quot; sees a <strong>Get the desktop app</strong> button at the top of every page.
              You can also send them the set-up link: it has the download, a one-click Connect and the steps.
            </p>
            <p>
              Tick <strong>App required</strong> once someone has the desktop app installed: from then on they can only clock in or
              end a break from the app. Clocking out and starting a break still work on the web as a backup.
            </p>
          </PageInfoButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DayPicker date={data.date} />
          <CopySetupLink />
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/admin/activity/rules" />}>
            App rules
          </Button>
        </div>
      </div>
      <TeamActivityTable rows={data.rows} date={data.date} timeZone={data.timeZone} />
      <ActivityExport date={data.date} />
    </div>
  );
}
