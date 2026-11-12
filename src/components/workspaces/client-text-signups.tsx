"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveClientText } from "@/lib/actions/workspaces";
import { unexpectedErrorMessage } from "@/lib/action-result";
import type { ClientPerson } from "@/lib/workspace-assignments";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Client workspaces → the client's own people: their mobile number and the
// evening text, set by the managing company with the person's consent
// (src/lib/workspace-assignments.ts, saveClientTextSignup).

function PersonRow({ orgId, person, dailyTextOn }: { orgId: string; person: ClientPerson; dailyTextOn: boolean }) {
  const [phone, setPhone] = useState(person.phone ?? "");
  const [enabled, setEnabled] = useState(person.smsDailyUpdates);
  const [consent, setConsent] = useState(false);
  const [saved, setSaved] = useState({ phone: person.phone ?? "", enabled: person.smsDailyUpdates });
  const [isPending, startTransition] = useTransition();

  const signingUp = enabled && !saved.enabled;
  const dirty = phone !== saved.phone || enabled !== saved.enabled;
  const blockedByStop = person.optedOut && !saved.enabled;

  function save() {
    if (signingUp && !consent) {
      toast.error("Confirm they agreed to get the evening text");
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveClientText({ orgId, userId: person.id, phone, enabled, consent });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setSaved({ phone, enabled });
        setConsent(false);
        toast.success(`Saved ${person.name}`);
      } catch (error) {
        toast.error(unexpectedErrorMessage(error, "Couldn't save"));
      }
    });
  }

  return (
    <div className="space-y-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-40 flex-1">
          <p className="text-sm font-medium">{person.name}</p>
          <p className="text-xs text-muted-foreground">{person.email}</p>
        </div>
        <Input
          type="tel"
          inputMode="tel"
          aria-label={`Mobile number for ${person.name}`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-44"
        />
        {blockedByStop ? (
          <Badge variant="outline" title="They replied STOP. Only they can turn texts back on, from their Settings page.">
            Replied STOP
          </Badge>
        ) : (
          <label className={`flex items-center gap-2 text-sm ${!dailyTextOn && !saved.enabled ? "opacity-50" : ""}`}>
            <Checkbox
              checked={enabled}
              disabled={!dailyTextOn && !saved.enabled}
              onCheckedChange={(c) => {
                setEnabled(c === true);
                if (c !== true) setConsent(false);
              }}
            />
            Evening text
          </label>
        )}
        <Button size="sm" onClick={save} disabled={!dirty} loading={isPending}>
          Save
        </Button>
      </div>
      {signingUp && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
          <span>They agreed to get these texts at this number. They can reply STOP at any time.</span>
        </label>
      )}
    </div>
  );
}

export function ClientTextSignups({ orgId, people, dailyTextOn }: { orgId: string; people: ClientPerson[]; dailyTextOn: boolean }) {
  return (
    <div>
      {!dailyTextOn && (
        <p className="mb-2 text-sm text-muted-foreground">
          The evening text is off for this workspace. A manager turns it on in the settings on its This week page; you can
          still save numbers now.
        </p>
      )}
      {people.map((p) => (
        <PersonRow key={p.id} orgId={orgId} person={p} dailyTextOn={dailyTextOn} />
      ))}
      {people.length === 0 && <p className="text-sm text-muted-foreground">The client hasn&apos;t added anyone yet.</p>}
    </div>
  );
}
