"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateTimezone } from "@/lib/actions/account";
import { browserTimezone, timezoneLabel } from "@/lib/time-entries";

// Controls how this user's own times display everywhere in the time-clock
// area (My Time, the all-users report, the timesheet PDF) and how a typed
// time is resolved when they add/edit an entry (see src/lib/time-entries.ts's
// effectiveTimezone). null means "not set" — every reader falls back to the
// browser's own zone, same as before this setting existed.
export function TimezoneSection({ initialTimezone }: { initialTimezone: string | null }) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [isPending, startTransition] = useTransition();

  // Computed client-side only — Intl.supportedValuesOf runs fine during SSR
  // too, but the "currently" line below reads the browser's own zone as a
  // fallback, which must not be resolved on the server (see local-time.tsx).
  const items = useMemo(() => {
    const zones = Intl.supportedValuesOf("timeZone");
    return Object.fromEntries(zones.map((z) => [z, timezoneLabel(z)]));
  }, []);

  function save(next: string | null) {
    setTimezone(next);
    startTransition(async () => {
      try {
        await updateTimezone(next);
        toast.success("Timezone updated");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update timezone");
      }
    });
  }

  return (
    <div className="space-y-2">
      <SearchableSelect
        items={items}
        value={timezone}
        onValueChange={save}
        placeholder="Use my browser's timezone"
        searchPlaceholder="Search timezones..."
        disabled={isPending}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Currently: {timezoneLabel(timezone || browserTimezone())}
          {!timezone && " (from your browser)"}
        </p>
        {timezone && (
          <Button type="button" variant="ghost" size="xs" disabled={isPending} onClick={() => save(null)}>
            {isPending ? <Loader2 className="size-3 animate-spin" /> : null}
            Reset to browser default
          </Button>
        )}
      </div>
    </div>
  );
}
