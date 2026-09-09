import { redirect } from "next/navigation";
import { MapPin } from "lucide-react";
import { auth } from "@/auth";
import { listMyCareRecipients } from "@/lib/actions/care-recipients";
import { mapsLinkForAddress } from "@/lib/geolocation";
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
            Clocking in for a visit asks which of these it&apos;s for (skipped automatically if you only have one).
          </p>
        </PageInfoButton>
      </div>
      {recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipients assigned to you yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {recipients.map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-1">
                <div className="font-medium">{r.name}</div>
                {r.client && <p className="text-xs text-muted-foreground">{r.client.name}</p>}
                {r.address && (
                  <a
                    href={mapsLinkForAddress(r.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                  >
                    <MapPin className="size-3.5" /> {r.address}
                  </a>
                )}
                {r.contactInfo && <p className="text-sm text-muted-foreground">{r.contactInfo}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
