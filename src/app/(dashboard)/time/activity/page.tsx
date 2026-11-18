import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { blockCaregiverRoute } from "@/lib/rbac";
import { isTrackedHere } from "@/lib/activity-monitoring";
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
  if (!session?.user || !(await isTrackedHere(session.user.id))) redirect("/time");
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
                This is what the desktop app recorded while you were clocked in: screenshots and the apps, window titles and
                websites you used. It never records keyboard or mouse input. Your workspace&apos;s owner sees the same thing.
              </p>
              <p>
                <strong>Productive</strong> is the share of your tracked time in apps the owner marked Productive. It doesn&apos;t
                change your paid hours.
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
