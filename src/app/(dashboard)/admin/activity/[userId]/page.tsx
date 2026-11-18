import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ForbiddenError, blockCaregiverRoute } from "@/lib/rbac";
import { getActivityDay, listUserDevices, requireMonitoringViewer } from "@/lib/activity-data";
import { ActivityDayView } from "@/components/activity/activity-day-view";
import { DayPicker } from "@/components/activity/day-picker";
import { DevicesList } from "@/components/activity/devices-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UserActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  await blockCaregiverRoute();
  const [{ userId }, { date }] = await Promise.all([params, searchParams]);
  let day, devices;
  try {
    await requireMonitoringViewer();
    [day, devices] = await Promise.all([getActivityDay(userId, date), listUserDevices(userId)]);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/admin/activity?date=${day.date}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
            <ChevronLeft className="size-4" /> Activity
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {day.user.name}
            {day.user.requireDesktopClock && <Badge variant="outline">App required</Badge>}
          </h1>
          <p className="text-xs text-muted-foreground">Times in {day.timeZone}</p>
        </div>
        <DayPicker date={day.date} />
      </div>
      <ActivityDayView day={day} canDelete />
      <Card>
        <CardHeader>
          <CardTitle>Computers</CardTitle>
        </CardHeader>
        <CardContent>
          <DevicesList devices={devices} timeZone={day.timeZone} canRevoke />
        </CardContent>
      </Card>
    </div>
  );
}
