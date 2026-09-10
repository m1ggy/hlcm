import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listMyCareRecipients } from "@/lib/actions/care-recipients";
import { RecipientSummary, ageFromDob } from "@/components/clients/care-recipient-summary";
import { CareInstructionChecklist } from "@/components/clients/care-instruction-checklist";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { PageInfoButton } from "@/components/shared/page-info-button";
import { Card, CardContent } from "@/components/ui/card";

// Caregiver-only page — who this Caregiver is assigned to visit, distinct
// from the existing /clients page, which stays a task-derived view of the
// licensing businesses their casework touches. This is also where the
// Clock in picker's data comes from (see TimeClockWidget), so this page
// doubles as "here's who you'll be asked to pick between."
//
// Every other role has no sidebar link to this at all, but redirect rather
// than let a stale bookmark hit listMyCareRecipients's own
// requireRole(["CAREGIVER"]) and crash with an uncaught ForbiddenError —
// same failure mode fixed on the dashboard home page for the reverse case.
export default async function CareRecipientsPage() {
  const session = await auth();
  if (session?.user?.role !== "CAREGIVER") redirect("/");

  const recipients = await listMyCareRecipients();

  return (
    <div className="space-y-6" data-tour="recipients-list">
      <div className="flex items-center gap-1.5">
        <h1 className="text-2xl font-semibold">My Recipients</h1>
        <PageInfoButton title="My Recipients">
          <p>
            The people you visit and give hands-on care to — not the same as the businesses on your Clients page.
            Clocking in for a visit asks which of these it&apos;s for (skipped automatically if you only have one),
            and tells you if you&apos;re near their address.
          </p>
        </PageInfoButton>
      </div>
      {recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipients assigned to you yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {recipients.map((r) => {
            const recipientAge = ageFromDob(r.dateOfBirth);
            const done = r.instructions.filter((i) => i.completed).length;
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <AvatarInitials name={r.name} className="size-9 text-sm" />
                    <div>
                      <div className="font-medium leading-tight">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.client?.name}
                        {recipientAge !== null && (r.client?.name ? " · " : "") + `Age ${recipientAge}`}
                      </div>
                    </div>
                  </div>
                  <RecipientSummary recipient={r} />
                  {r.instructions.length > 0 && (
                    <div className="border-t pt-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">To do this visit</p>
                        <span className="text-xs text-muted-foreground">
                          {done}/{r.instructions.length} done
                        </span>
                      </div>
                      <CareInstructionChecklist careRecipientId={r.id} instructions={r.instructions} hideHeader />
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
