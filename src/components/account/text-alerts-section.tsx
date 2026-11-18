"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTextAlerts, type TextAlertKind } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COPY = {
  forms: {
    label: "Text me when someone fills in a form I'm picked for",
    hint: "The text has the form's name, the person's first name and a link.",
  },
  daily: {
    label: "Text me a daily update",
    hint: "On days the team worked on your projects, a short summary arrives in the evening, with a link to the full week.",
  },
  urgent: {
    label: "Text me when a task is marked urgent",
    hint: "For tasks you're on (or any task, if you manage the workspace), with a link to the task.",
  },
} as const;

/** Account → Notifications: your mobile number and your text opt-ins. */
export function TextAlertsSection({
  options,
  phone: initialPhone,
  optedOut,
}: {
  options: { kind: TextAlertKind; enabled: boolean }[];
  phone: string | null;
  optedOut: boolean;
}) {
  const initial = Object.fromEntries(options.map((o) => [o.kind, o.enabled])) as Partial<Record<TextAlertKind, boolean>>;
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [alerts, setAlerts] = useState(initial);
  const [saved, setSaved] = useState({ phone: initialPhone ?? "", alerts: initial });
  const [pending, start] = useTransition();
  const dirty = phone !== saved.phone || options.some((o) => alerts[o.kind] !== saved.alerts[o.kind]);
  const anyOn = options.some((o) => saved.alerts[o.kind]);

  return (
    <div className="space-y-3">
      {options.map(({ kind }) => (
        <div key={kind} className="flex items-start gap-2">
          <Checkbox
            id={`text-alerts-${kind}`}
            checked={Boolean(alerts[kind])}
            onCheckedChange={(c) => setAlerts((a) => ({ ...a, [kind]: Boolean(c) }))}
            className="mt-0.5"
          />
          <Label htmlFor={`text-alerts-${kind}`} className="block text-sm font-normal">
            {COPY[kind].label}
            <span className="block text-xs text-muted-foreground">{COPY[kind].hint}</span>
          </Label>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Reply STOP to any text to stop them all.</p>
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
              const r = await updateTextAlerts({ phone, alerts });
              if (!r.ok) return void toast.error(r.error);
              setPhone(r.data.phone ?? "");
              setSaved({ phone: r.data.phone ?? "", alerts });
              toast.success("Saved");
            })
          }
        >
          Save
        </Button>
      </div>
      {optedOut && !anyOn && (
        <p className="text-xs text-amber-700 dark:text-amber-400">You replied STOP earlier. Turn a text back on and text START to the number to get texts again.</p>
      )}
    </div>
  );
}
