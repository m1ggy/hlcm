import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccount } from "@/lib/actions/account";
import { MyTimeLog } from "@/components/time-clock/my-time-log";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Card, CardContent } from "@/components/ui/card";

// A Caregiver's own hours — the same personal log staff see on /time, minus
// the team timesheet and payroll that page also carries (and that stays
// off-limits to this role).
export default async function HoursPage() {
  const session = await auth();
  if (session?.user?.role !== "CAREGIVER") redirect("/time");

  const account = await getAccount();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">My Hours</h1>
        <PageInfoButton title="My Hours">
          <p>
            Every visit and shift you&apos;ve clocked, by week. Spot something wrong — a forgotten clock-out, a visit
            missing? Tell the office; they can correct it.
          </p>
        </PageInfoButton>
      </div>
      <Card>
        <CardContent>
          <MyTimeLog accountTimezone={account.timezone} />
        </CardContent>
      </Card>
    </div>
  );
}
