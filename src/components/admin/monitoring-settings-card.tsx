"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { saveMonitoringSettings } from "@/lib/actions/monitoring-settings";
import { unexpectedErrorMessage } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// The owner's switch for the activity monitoring add-on and the notice the
// desktop app shows (docs/activity-monitoring-plan.md). Shown only once the
// platform has granted the add-on.
export function MonitoringSettingsCard({
  initial,
  defaultPolicy,
}: {
  initial: { enabled: boolean; policy: string | null };
  defaultPolicy: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [custom, setCustom] = useState(initial.policy !== null);
  const [policy, setPolicy] = useState(initial.policy ?? defaultPolicy);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const result = await saveMonitoringSettings({ enabled, policy: custom ? policy : "" });
        if (!result.ok) return void toast.error(result.error);
        toast.success("Activity monitoring saved");
        router.refresh();
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save. Please try again."));
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity monitoring</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Your staff install the desktop app and clock in from it. While they&apos;re clocked in it takes a screenshot every 30
          minutes and records which apps and sites they use. It never records keyboard or mouse input; after 2 hours without any, it
          clocks them out. Only you see their activity, under{" "}
          <Link href="/admin/activity" className="underline">
            Admin &gt; Activity
          </Link>
          . People your company doesn&apos;t employ, such as staff another company assigns here, are never tracked.
        </p>
        <label className="flex items-start gap-2 rounded-lg border p-3">
          <Checkbox className="mt-0.5" checked={enabled} onCheckedChange={(c) => setEnabled(c === true)} />
          <span>
            <span className="font-medium">Turn on activity monitoring</span>
            <span className="block text-xs text-muted-foreground">
              Turning it off stops all tracking and lets everyone clock in on the web again. Past activity is kept for 90 days.
            </span>
          </span>
        </label>
        <div className="space-y-2">
          <Label>Notice shown in the desktop app</Label>
          <label className="flex items-center gap-2">
            <Checkbox checked={custom} onCheckedChange={(c) => setCustom(c === true)} />
            <span>Write our own notice</span>
          </label>
          <Textarea rows={12} value={custom ? policy : defaultPolicy} onChange={(e) => setPolicy(e.target.value)} disabled={!custom} />
          <p className="text-xs text-muted-foreground">
            Everyone accepts it before their first clock-in, and again whenever you change it. Some states (for example New York,
            Connecticut and Delaware) require written notice of electronic monitoring; check yours with your lawyer.
          </p>
        </div>
        <Button onClick={save} loading={isPending}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
