"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTextAlerts } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Account → Notifications: your mobile number and "text me about new form submissions". */
export function TextAlertsSection({ phone: initialPhone, enabled: initialEnabled, optedOut }: { phone: string | null; enabled: boolean; optedOut: boolean }) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saved, setSaved] = useState({ phone: initialPhone ?? "", enabled: initialEnabled });
  const [pending, start] = useTransition();
  const dirty = phone !== saved.phone || enabled !== saved.enabled;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Checkbox id="text-alerts" checked={enabled} onCheckedChange={(c) => setEnabled(Boolean(c))} className="mt-0.5" />
        <Label htmlFor="text-alerts" className="block text-sm font-normal">
          Text me when someone fills in a form I&apos;m picked for
          <span className="block text-xs text-muted-foreground">The text has the form&apos;s name, the person&apos;s first name and a link. Reply STOP to any text to stop them.</span>
        </Label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="text-alerts-phone">Mobile number</Label>
          <Input id="text-alerts-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className="w-56" />
        </div>
        <Button
          variant="outline"
          disabled={!dirty}
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await updateTextAlerts({ phone, enabled });
              if (!r.ok) return void toast.error(r.error);
              setPhone(r.data.phone ?? "");
              setSaved({ phone: r.data.phone ?? "", enabled });
              toast.success(enabled ? "You'll get texts for new form submissions" : "Saved");
            })
          }
        >
          Save
        </Button>
      </div>
      {optedOut && saved.enabled === false && (
        <p className="text-xs text-amber-700 dark:text-amber-400">You replied STOP earlier. Turn this back on and text START to the number to get texts again.</p>
      )}
    </div>
  );
}
