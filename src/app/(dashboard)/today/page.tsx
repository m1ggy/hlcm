import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMyToday } from "@/lib/actions/visits";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { TodayView } from "@/components/visits/today-view";
import { countMyUnconfirmedPayments } from "@/lib/actions/payroll";

// A Caregiver's home screen: the visit in progress (checklist, end visit,
// report a concern), then today's schedule with a Start button per visit.
// Built phone-first — this is what they open at the door.
export default async function TodayPage() {
  const session = await auth();
  if (session?.user?.role !== "CAREGIVER") redirect("/");

  const [data, unconfirmedPay] = await Promise.all([getMyToday(), countMyUnconfirmedPayments()]);
  const firstName = session.user.name?.split(" ")[0] ?? "";

  return (
    <div data-tour="today" className="space-y-4">
      {unconfirmedPay > 0 && (
        <Link
          href="/hours#my-pay"
          className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-900 hover:bg-sky-500/15 dark:text-sky-200"
        >
          <Wallet className="size-4 shrink-0" />
          <span>
            {unconfirmedPay === 1 ? "A payment was sent to you" : `${unconfirmedPay} payments were sent to you`} — tap to confirm you
            received {unconfirmedPay === 1 ? "it" : "them"}.
          </span>
        </Link>
      )}
      <TodayView data={data} firstName={firstName} />
    </div>
  );
}
