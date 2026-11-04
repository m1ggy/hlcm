import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { blockCaregiverRoute, canManagePayroll, isManagement } from "@/lib/rbac";
import { listPayrollPeriods, getPayrollPeriod } from "@/lib/actions/payroll";
import { isValidPeriod, periodForDay, recentPeriods } from "@/lib/payroll";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { PayrollPeriodView } from "@/components/payroll/payroll-period-view";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await blockCaregiverRoute();
  const session = await auth();
  const role = session?.user?.role;
  if (!isManagement(role)) notFound();
  const canManage = canManagePayroll(role);

  // ?period=<start day>; anything else falls back to the current period.
  const { period } = await searchParams;
  const start = period && isValidPeriod({ start: period, end: periodForDay(period).end }) ? period : recentPeriods(1)[0].start;

  const [periods, detail] = await Promise.all([listPayrollPeriods(), getPayrollPeriod(start)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">Payroll</h1>
        <PageInfoButton title="Payroll">
          <p>
            One pay period at a time (1st–15th, 16th–end of month). Each person&apos;s hours and gross pay come from their time
            on the Time page; a shift counts in the period of the day it started.
          </p>
          {canManage ? (
            <>
              <p>
                Use <strong>Mark paid</strong> for one person or <strong>Mark all paid</strong> for everyone. Gross starts as hours ×
                rate; enter the net (take-home) amount you actually sent. Each person gets a notification asking them to confirm
                they received it.
              </p>
              <p>
                Once someone is paid, their time in that period is locked — nobody can add, edit or delete it. Use{" "}
                <strong>Undo paid</strong> from the row&apos;s menu to unlock it.
              </p>
              <p>
                Files go on each person: pick them when you mark someone paid, or use the paperclip on their row later. That
                person sees and can download their own files — nobody else&apos;s.
              </p>
              <p>If someone reports a problem, you&apos;re notified; fix it, then use Mark problem resolved so they can confirm.</p>
            </>
          ) : (
            <p>You can view payroll here. Only the accountant can mark people paid or add files.</p>
          )}
        </PageInfoButton>
      </div>
      <PayrollPeriodView periods={periods} detail={detail} canManage={canManage} />
    </div>
  );
}
