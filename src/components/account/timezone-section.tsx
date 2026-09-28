"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateTimezone } from "@/lib/actions/account";
import { timezoneLabel } from "@/lib/time-entries";

// Controls how this user's own times display everywhere in the time-clock
// area (My Time, the all-users report, the timesheet PDF) and how a typed
// time is resolved when they add/edit an entry. null means "not set" — every
// reader falls back to the workspace's timezone (defaultTimezone, from
// Organization settings — see getAccount), so a self clock-in and a
// manually-added entry land on the same hours by default.
export function TimezoneSection({ initialTimezone, defaultTimezone }: { initialTimezone: string | null; defaultTimezone: string }) {
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
        placeholder={`Use the workspace default (${defaultTimezone})`}
        searchPlaceholder="Search timezones..."
        disabled={isPending}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Currently: {timezoneLabel(timezone || defaultTimezone)}
          {!timezone && " (default)"}
        </p>
        {timezone && (
          <Button type="button" variant="ghost" size="xs" loading={isPending} onClick={() => save(null)}>
            Reset to default
          </Button>
        )}
      </div>
    </div>
  );
}
