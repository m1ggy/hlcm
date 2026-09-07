"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CUSTOM = "__custom__";

// Shared by every "send" dialog that emails a client (invoice PDF, receipt,
// the online/Stripe invoice) — lets whoever's sending pick the client's
// business email, their owner email, or type a one-off address instead,
// rather than always defaulting to businessEmail ?? ownerEmail. Reports
// the resolved recipient address back via onChange, not which option was
// picked — callers just need the final string to send to.
export function EmailRecipientPicker({
  businessEmail,
  ownerEmail,
  onChange,
}: {
  businessEmail: string | null;
  ownerEmail: string | null;
  onChange: (email: string) => void;
}) {
  const hasBusiness = !!businessEmail;
  // Skip an "Owner email" option that's identical to the business one —
  // nothing gained from offering the same address twice.
  const hasOwner = !!ownerEmail && ownerEmail !== businessEmail;
  const defaultMode = hasBusiness ? "business" : hasOwner ? "owner" : CUSTOM;

  const [mode, setMode] = useState<string>(defaultMode);
  const [customEmail, setCustomEmail] = useState("");

  function resolve(nextMode: string, nextCustom: string) {
    if (nextMode === "business") return businessEmail ?? "";
    if (nextMode === "owner") return ownerEmail ?? "";
    return nextCustom;
  }

  function handleModeChange(next: string) {
    setMode(next);
    onChange(resolve(next, customEmail));
  }

  function handleCustomChange(next: string) {
    setCustomEmail(next);
    onChange(resolve(mode, next));
  }

  // Report the initial resolved value once, on mount — the parent's
  // recipient state (empty until this runs) starts correct without the
  // caller having to duplicate defaultMode's business-then-owner logic.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onChange(resolve(defaultMode, "")), []);

  const items: Record<string, string> = {
    ...(hasBusiness ? { business: `Business email — ${businessEmail}` } : {}),
    ...(hasOwner ? { owner: `Owner email — ${ownerEmail}` } : {}),
    [CUSTOM]: "Different email...",
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>Send to</Label>
        <Select items={items} value={mode} onValueChange={(v) => handleModeChange(v ?? mode)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(items).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mode === CUSTOM && (
        <Input
          type="email"
          placeholder="name@example.com"
          value={customEmail}
          onChange={(e) => handleCustomChange(e.target.value)}
        />
      )}
    </div>
  );
}
