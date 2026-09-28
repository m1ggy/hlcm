"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveOrganizationSettings } from "@/lib/actions/organization";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { timezoneLabel } from "@/lib/time-entries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";

export function OrganizationSettingsForm({
  initial,
  workspaceUrl,
}: {
  initial: { name: string; timezone: string | null; replyToEmail: string | null };
  workspaceUrl: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [replyToEmail, setReplyToEmail] = useState(initial.replyToEmail ?? "");
  const [isPending, startTransition] = useTransition();

  const zones = useMemo(
    () => Object.fromEntries(Intl.supportedValuesOf("timeZone").map((z) => [z, timezoneLabel(z)])),
    []
  );

  function handleSave() {
    startTransition(async () => {
      try {
        const result = await saveOrganizationSettings({ name, timezone, replyToEmail });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Organization settings saved");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save the settings. Please try again."));
      }
    });
  }

  return (
    <form
      className="max-w-lg space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="org-name">Name</Label>
        <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          Shown in the sidebar, on the sign-in page, and on the emails and PDFs this workspace sends.
        </p>
      </div>
      <div className="space-y-1">
        <Label>Timezone</Label>
        <SearchableSelect
          items={zones}
          value={timezone}
          onValueChange={setTimezone}
          placeholder="Server default"
          searchPlaceholder="Search timezones..."
        />
        <p className="text-xs text-muted-foreground">When org-wide schedules run — e.g. the daily due-date digest goes out at 8am here.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="org-reply-to">Reply-to email</Label>
        <Input id="org-reply-to" type="email" value={replyToEmail} onChange={(e) => setReplyToEmail(e.target.value)} placeholder="billing@yourcompany.com" />
        <p className="text-xs text-muted-foreground">
          Emails from this workspace — invoices, receipts, invites — are sent under its name; replies go here.
        </p>
      </div>
      <div className="space-y-1">
        <Label>Workspace address</Label>
        <Input readOnly value={workspaceUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      </div>
      <Button type="submit" loading={isPending}>
        Save
      </Button>
    </form>
  );
}
