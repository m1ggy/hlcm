"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Fixed list keeps reporting consistent later (filtering/grouping by
// method) without shutting out anything unusual via "Other".
const METHODS = ["Cash", "Check", "Wire", "Zelle"] as const;
const OTHER = "Other";

/**
 * Value shape: a plain string, same as it's stored (Invoice.paymentMethod) —
 * one of the fixed METHODS, or free text typed under "Other". Whether
 * "Other" is selected is tracked as its own bit of UI state rather than
 * derived from the value, since an empty free-text value would otherwise
 * be indistinguishable from nothing picked yet.
 */
export function PaymentMethodSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [otherMode, setOtherMode] = useState(() => value !== "" && !(METHODS as readonly string[]).includes(value));

  return (
    <div className="space-y-1">
      <Label>Payment method</Label>
      <div className="flex gap-2">
        <Select
          value={otherMode ? OTHER : value}
          onValueChange={(v) => {
            const next = v ?? OTHER;
            if (next === OTHER) {
              setOtherMode(true);
              if ((METHODS as readonly string[]).includes(value)) onChange("");
            } else {
              setOtherMode(false);
              onChange(next);
            }
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
            <SelectItem value={OTHER}>{OTHER}</SelectItem>
          </SelectContent>
        </Select>
        {otherMode && (
          <Input
            placeholder="Describe it"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 flex-1"
          />
        )}
      </div>
    </div>
  );
}
