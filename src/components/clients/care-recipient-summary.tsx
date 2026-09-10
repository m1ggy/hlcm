import { CalendarDays, Mail, MapPin, MessageSquareText, Phone, Stethoscope, UserRound } from "lucide-react";
import { mapsLinkForAddress } from "@/lib/geolocation";

// Pure presentation, no client-side state — shared by the admin
// CareRecipientsCard (client component) and the Caregiver's own
// /care-recipients page (server component), so both render this record the
// same way instead of two hand-maintained layouts drifting apart.
export type RecipientSummaryFields = {
  address: string | null;
  latitude?: number | null;
  // The recipient's own reachability — distinct from emergencyContact*
  // below (a different person to call about them, not them directly).
  phone: string | null;
  email: string | null;
  preferredContactMethod: string | null;
  contactNotes: string | null;
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
    // min-w-0 on both the row and the content wrapper — and the content
    // wrapper has to be a block-level element (a div, not a span):
    // min-width has no effect on an inline element at all per the CSS
    // spec, so a plain <span> here silently ignored it. Without both, an
    // unbreakable long value (an email address, an address with no
    // spaces to wrap at) pushed anything after it (the "Preferred" badge)
    // straight past the card's edge instead of wrapping — it stayed in
    // the DOM and stayed "visible" by every check but the one that
    // matters, actually being on screen. Caught live comparing the same
    // component at two different card widths.
    <div className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
      <span className="mt-0.5 shrink-0 text-muted-foreground/70">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function PreferredBadge({ show }: { show: boolean }) {
  if (!show) return null;
  // Its own line, always — not relying on inline wrap to kick in exactly
  // when the row gets tight (that's what silently pushed this off the
  // edge of a narrower card in the first place: it fit inline often
  // enough in testing to look fine, then didn't at another width).
  return (
    <span className="mt-0.5 block w-fit rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-medium tracking-wide text-primary uppercase">
      Preferred
    </span>
  );
}

export function RecipientSummary({ recipient }: { recipient: RecipientSummaryFields }) {
  const hasEmergencyContact = recipient.emergencyContactName || recipient.emergencyContactPhone;
  const preferred = recipient.preferredContactMethod?.toLowerCase();
  const hasOwnContactRow = recipient.phone || recipient.email || recipient.visitSchedule || hasEmergencyContact;

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
      {hasOwnContactRow && (
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {recipient.phone && (
            <MetaRow icon={<Phone className="size-3.5" />}>
              <a href={`tel:${recipient.phone}`} className="hover:underline">
                {recipient.phone}
              </a>
              <PreferredBadge show={preferred === "phone"} />
            </MetaRow>
          )}
          {recipient.email && (
            <MetaRow icon={<Mail className="size-3.5" />}>
              <a href={`mailto:${recipient.email}`} className="hover:underline">
                {recipient.email}
              </a>
              <PreferredBadge show={preferred === "email"} />
            </MetaRow>
          )}
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
      {recipient.contactNotes && (
        <MetaRow icon={<MessageSquareText className="size-3.5" />}>
          <span className="italic">{recipient.contactNotes}</span>
        </MetaRow>
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
