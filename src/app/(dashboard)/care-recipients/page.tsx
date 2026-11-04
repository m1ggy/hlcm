import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, MessageSquareText } from "lucide-react";
import { auth } from "@/auth";
import { listMyCareRecipients } from "@/lib/actions/care-recipients";
import { getAccount } from "@/lib/actions/account";
import { effectiveTimezone } from "@/lib/time-entries";
import { formatShiftRange, formatWeekdays } from "@/lib/visits";
import { RecipientSummary, ageFromDob } from "@/components/clients/care-recipient-summary";
import { CareInstructionChecklist } from "@/components/clients/care-instruction-checklist";
import { ReportConcernDialog } from "@/components/visits/report-concern-dialog";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Card, CardContent } from "@/components/ui/card";

// Groups identical time ranges so "Mon 9–1, Wed 9–1, Fri 9–1" reads as
// "Mon, Wed, Fri · 9:00 AM – 1:00 PM".
function groupShifts(shifts: { weekday: number; startMinute: number; endMinute: number }[]) {
  const groups = new Map<string, { startMinute: number; endMinute: number; weekdays: number[] }>();
  for (const s of shifts) {
    const key = `${s.startMinute}-${s.endMinute}`;
    const group = groups.get(key) ?? { startMinute: s.startMinute, endMinute: s.endMinute, weekdays: [] };
    group.weekdays.push(s.weekday);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.startMinute - b.startMinute);
}

// Caregiver-only reference page — who this Caregiver is assigned to, with
// everything to know before a visit: contacts, care notes, their own
// schedule there, the standing care tasks, and the last few visit notes
// from whoever went before (handoff on a rotation). Visits themselves run
// from the Today page.
//
// Every other role has no sidebar link to this at all, but redirect rather
// than let a stale bookmark hit listMyCareRecipients's own
// requireRole(["CAREGIVER"]) and crash with an uncaught ForbiddenError.
export default async function CareRecipientsPage() {
  const session = await auth();
  if (session?.user?.role !== "CAREGIVER") redirect("/");

  const [recipients, account] = await Promise.all([listMyCareRecipients(), getAccount()]);
  const timeZone = effectiveTimezone(account.timezone);

  return (
    <div className="space-y-6" data-tour="recipients-list">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">My Recipients</h1>
        <PageInfoButton title="My Recipients">
          <p>
            The people you visit and give hands-on care to — not the same as the businesses on your Clients page.
            Everything to know before a visit lives here; start and run the visit itself from{" "}
            <Link href="/today" className="font-medium text-primary hover:underline">
              Today
            </Link>
            .
          </p>
        </PageInfoButton>
      </div>
      {recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipients assigned to you yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {recipients.map((r) => {
            const recipientAge = ageFromDob(r.dateOfBirth);
            const schedule = groupShifts(r.shifts);
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <AvatarInitials name={r.name} className="size-9 text-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-tight">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.client?.name}
                        {recipientAge !== null && (r.client?.name ? " · " : "") + `Age ${recipientAge}`}
                      </div>
                    </div>
                    <ReportConcernDialog recipient={{ id: r.id, name: r.name }} size="sm" />
                  </div>

                  {schedule.length > 0 && (
                    <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Your visits</p>
                        {schedule.map((g) => (
                          <p key={`${g.startMinute}-${g.endMinute}`}>
                            {formatWeekdays(g.weekdays)} · {formatShiftRange(g.startMinute, g.endMinute)}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  <RecipientSummary recipient={r} />

                  {r.instructions.length > 0 && (
                    <div className="border-t pt-3">
                      <CareInstructionChecklist careRecipientId={r.id} instructions={r.instructions} />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        You&apos;ll check these off on{" "}
                        <Link href="/today" className="font-medium text-primary hover:underline">
                          Today
                        </Link>{" "}
                        during each visit.
                      </p>
                    </div>
                  )}

                  {r.timeEntries.length > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        <MessageSquareText className="size-3.5" /> Recent visit notes
                      </p>
                      {r.timeEntries.map((v) => (
                        <div key={v.id} className="text-sm">
                          <p className="text-xs text-muted-foreground">
                            {v.clockIn.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone })}
                            {" · "}
                            {v.user.name}
                          </p>
                          <p className="whitespace-pre-wrap">{v.visitNote}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
