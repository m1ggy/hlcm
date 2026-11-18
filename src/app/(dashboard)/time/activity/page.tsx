import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { blockCaregiverRoute, isTrackedRole } from "@/lib/rbac";
import { getActivityDay, listUserDevices } from "@/lib/activity-data";
import { ActivityDayView } from "@/components/activity/activity-day-view";
import { DayPicker } from "@/components/activity/day-picker";
import { DevicesList } from "@/components/activity/devices-list";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Each tracked user's own view of what the desktop app recorded. They can
// see everything an owner sees about them, but not delete screenshots.
export default async function MyActivityPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await blockCaregiverRoute("/hours");
  const session = await auth();
  if (!session?.user || !isTrackedRole(session.user.role)) redirect("/time");
  const { date } = await searchParams;
  const [day, devices] = await Promise.all([getActivityDay(session.user.id, date), listUserDevices(session.user.id)]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/time" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ChevronLeft className="size-4" /> Time
          </Link>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-semibold">My activity</h1>
            <PageInfoButton title="My activity">
              <p>
                This is what the HCLM desktop app recorded while you were clocked in: screenshots, keyboard and mouse activity
                (counts only, never what you typed) and the apps, window titles and websites you used. Owners see the same thing.
              </p>
              <p>
                <strong>Activity</strong> is the share of time with keyboard or mouse input. <strong>Adjusted</strong> gives credit for
                time spent reading or in meetings in apps the owner has set rules for. Neither changes your paid hours.
              </p>
              <p>Screenshots are kept for 90 days and can&apos;t be deleted from here.</p>
            </PageInfoButton>
          </div>
        </div>
        <DayPicker date={day.date} />
      </div>
      <ActivityDayView day={day} canDelete={false} />
      <Card>
        <CardHeader>
          <CardTitle>My computers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DevicesList devices={devices} timeZone={day.timeZone} canRevoke={false} />
          <Link href="/time/app" className="text-sm text-primary hover:underline">
            Get the desktop app
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
