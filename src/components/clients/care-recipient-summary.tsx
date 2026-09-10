import { CalendarDays, MapPin, Phone, Stethoscope, UserRound } from "lucide-react";
import { mapsLinkForAddress } from "@/lib/geolocation";

// Pure presentation, no client-side state — shared by the admin
// CareRecipientsCard (client component) and the Caregiver's own
// /care-recipients page (server component), so both render this record the
// same way instead of two hand-maintained layouts drifting apart.
export type RecipientSummaryFields = {
  address: string | null;
  latitude?: number | null;
  contactInfo: string | null;
  visitSchedule: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  careNotes: string | null;
};

export function ageFromDob(dateOfBirth: Date | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const beforeBirthdayThisYear =
    now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthdayThisYear) years -= 1;
  return years;
}

function MetaRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
      <span className="mt-0.5 shrink-0 text-muted-foreground/70">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function RecipientSummary({ recipient }: { recipient: RecipientSummaryFields }) {
  const hasEmergencyContact = recipient.emergencyContactName || recipient.emergencyContactPhone;

  return (
    <div className="space-y-2">
      {recipient.address && (
        <MetaRow icon={<MapPin className="size-3.5" />}>
          <a href={mapsLinkForAddress(recipient.address)} target="_blank" rel="noreferrer" className="hover:underline">
            {recipient.address}
          </a>
          {recipient.latitude == null && (
            <span className="ml-1 text-xs italic text-muted-foreground/70">(location unavailable)</span>
          )}
        </MetaRow>
      )}
      {(recipient.contactInfo || recipient.visitSchedule || hasEmergencyContact) && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {recipient.contactInfo && <MetaRow icon={<Phone className="size-3.5" />}>{recipient.contactInfo}</MetaRow>}
          {recipient.visitSchedule && <MetaRow icon={<CalendarDays className="size-3.5" />}>{recipient.visitSchedule}</MetaRow>}
          {hasEmergencyContact && (
            <MetaRow icon={<UserRound className="size-3.5" />}>
              {recipient.emergencyContactName || "Emergency contact"}
              {recipient.emergencyContactRelationship && ` · ${recipient.emergencyContactRelationship}`}
              {recipient.emergencyContactPhone && (
                <>
                  {" — "}
                  <a href={`tel:${recipient.emergencyContactPhone}`} className="hover:underline">
                    {recipient.emergencyContactPhone}
                  </a>
                </>
              )}
            </MetaRow>
          )}
        </div>
      )}
      {recipient.careNotes && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 text-sm text-sky-900 dark:text-sky-200">
          <Stethoscope className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <p className="whitespace-pre-wrap">{recipient.careNotes}</p>
        </div>
      )}
    </div>
  );
}
